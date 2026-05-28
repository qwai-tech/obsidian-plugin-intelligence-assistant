import type { Message, RAGSource, WebSearchResult, Agent } from '@/types';
import type { ToolRegistry } from '@/application/tools/tool-registry';
import type { WebSearchService } from '@/application/services/web-search-service';
import type { RegisteredTool } from '@/types/common/tools';
import type { StreamChunk, ILLMProvider } from '@/types/common/llm';
import type {
	AgentLoopCallbacks,
	AgentLoopOptions,
	AgentWorkingMessage,
	AssistantWithCalls,
	ToolResultEntry,
} from './types';
import { HistoryCompactor } from './history-compactor';
import type { AgentSenseService } from './agent-sense-service';

interface AutonomousAgentLoopDeps {
	toolRegistry: ToolRegistry;
	senseService: AgentSenseService;
	historyCompactor: HistoryCompactor;
	webSearchService: WebSearchService;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	recordUsage?: (record: {
		model: string;
		provider: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		timestamp: number;
		conversationId?: string;
	}) => Promise<void>;
	defaultModel?: string;
}

const MAX_CONSECUTIVE_FAILURES = 3;

export class AutonomousAgentLoop {
	constructor(private readonly deps: AutonomousAgentLoopDeps) {}

	async execute(messages: Message[], options: AgentLoopOptions, callbacks: AgentLoopCallbacks): Promise<void> {
		try {
			const providerBundle = this.deps.createProvider(options.model);
			if (!providerBundle) {
				callbacks.onError(new Error(`No provider configuration found for model: ${options.model}`));
				return;
			}

			const activeAgent = this.getActiveAgent(options);
			const contextWindow = options.contextWindow ?? activeAgent?.contextWindow ?? 20;
			const maxSteps = activeAgent?.maxSteps ?? 10;
			const userQuery = messages[messages.length - 1]?.content ?? '';
			const sense = await this.deps.senseService.sense({
				userQuery,
				model: options.model,
				defaultModel: this.deps.defaultModel,
				enableRAG: options.enableRAG,
				agentId: activeAgent?.id,
				references: options.references,
			});

			callbacks.onThought('Sensed active note, graph neighbors, references, RAG context, and memory.', 'sense');

			const ragSources: RAGSource[] = [...sense.ragSources];
			const webResults = await this.loadWebResults(userQuery, options);
			const baseSystemMessages = this.buildBaseSystemMessages(
				options,
				activeAgent,
				this.deps.senseService.formatSenseContext(sense),
				webResults,
			);
			const workingMessages: AgentWorkingMessage[] = [...messages];
			const resolvedTools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} });
			const nativeTools = this.deps.toolRegistry.toOpenAIFunctions(resolvedTools);
			const consecutiveFailures = new Map<string, number>();
			let lastContent = '';
			let lastReasoning = '';
			let lastStepUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
			let reachedStepLimit = false;

			for (let step = 0; step < maxSteps; step++) {
				if (callbacks.checkAbort?.()) break;

				callbacks.onThought(`Planning step ${step + 1}.`, 'plan');
				const compacted = this.deps.historyCompactor.compact(workingMessages);
				const deduped = deduplicateWorkingMessages(compacted.messages);
				const truncated = deduped.length > contextWindow ? deduped.slice(-contextWindow) : deduped;
				const allMessages = [...baseSystemMessages, ...truncated];
				const pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
				const stepCapture: { usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null } = { usage: null };

				lastContent = '';
				lastReasoning = '';
				await providerBundle.provider.streamChat(
					{
						messages: allMessages as Message[],
						model: options.model,
						temperature: options.temperature,
						maxTokens: options.maxTokens,
						topP: options.topP,
						frequencyPenalty: options.frequencyPenalty,
						presencePenalty: options.presencePenalty,
						tools: nativeTools.length > 0 ? nativeTools : undefined,
						toolChoice: nativeTools.length > 0 ? 'auto' : undefined,
					},
					(chunk: StreamChunk) => {
						if (callbacks.checkAbort?.()) return;
						if (chunk.content) {
							lastContent += chunk.content;
							callbacks.onChunk(chunk);
						}
						if (chunk.reasoning) lastReasoning += chunk.reasoning;
						if (chunk.usage) stepCapture.usage = chunk.usage;
						if (chunk.toolCalls) {
							for (const toolCall of chunk.toolCalls) {
								pendingToolCalls.push({
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: this.parseToolArguments(toolCall.function.arguments),
								});
							}
						}
					},
				);

				lastStepUsage = stepCapture.usage;
				if (lastStepUsage && this.deps.recordUsage) {
					void this.deps.recordUsage({
						model: options.model,
						provider: providerBundle.providerId,
						promptTokens: lastStepUsage.promptTokens,
						completionTokens: lastStepUsage.completionTokens,
						totalTokens: lastStepUsage.totalTokens,
						timestamp: Date.now(),
						conversationId: options.conversationId,
					});
				}

				if (pendingToolCalls.length === 0) break;

				workingMessages.push(this.createAssistantWithCalls(options.model, lastContent, lastReasoning, pendingToolCalls));
				for (const result of await this.executeTools(pendingToolCalls, resolvedTools, consecutiveFailures, callbacks)) {
					workingMessages.push(result);
				}
				callbacks.onThought(`Reflected on ${pendingToolCalls.length} tool result(s).`, 'reflect');
				if (step === maxSteps - 1) {
					reachedStepLimit = true;
					callbacks.onThought(`Reached the agent step limit of ${maxSteps}.`, 'reflect');
				}
			}

			const finalContent = reachedStepLimit
				? [
					lastContent.trim(),
					`Reached the agent step limit of ${maxSteps}. Review the tool results above or increase this agent's max steps to continue.`,
				].filter(Boolean).join('\n\n')
				: lastContent;

			callbacks.onComplete({
				role: 'assistant',
				content: finalContent,
				model: options.model,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: lastStepUsage ?? undefined,
			});
		} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private getActiveAgent(options: AgentLoopOptions): Agent | undefined {
		return options.agentId ? (options.agents ?? []).find(agent => agent.id === options.agentId) : undefined;
	}

	private buildBaseSystemMessages(
		options: AgentLoopOptions,
		activeAgent: Agent | undefined,
		senseContext: string,
		webResults: WebSearchResult[],
	): Message[] {
		const messages: Message[] = [
			{ role: 'system', content: senseContext },
			{ role: 'system', content: this.buildAgentInstruction(options.isGenericAgent ?? !options.agentId, activeAgent) },
			...(options.activeSystemPrompts ?? []),
		];
		if (webResults.length > 0) {
			messages.push({ role: 'system', content: this.deps.webSearchService.formatResultsAsContext(webResults) });
		}
		return messages;
	}

	private buildAgentInstruction(isGenericAgent: boolean, activeAgent: Agent | undefined): string {
		const tools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} });
		const toolDescriptions = tools.map(tool => `- ${tool.llmName}: ${tool.definition.description}`).join('\n');
		const agentName = isGenericAgent ? 'the default Obsidian knowledge agent' : `Agent "${activeAgent?.name ?? 'unknown'}"`;
		return [
			`You are ${agentName}.`,
			'Run a Sense-Plan-Act-Reflect loop for Obsidian knowledge work.',
			'Use vault context before external context.',
			'Never claim a vault write was applied unless the user approved a write proposal.',
			toolDescriptions ? `Available tools:\n${toolDescriptions}` : 'No tools are enabled for this agent.',
		].join('\n\n');
	}

	private async loadWebResults(userQuery: string, options: AgentLoopOptions): Promise<WebSearchResult[]> {
		if (!options.enableWebSearch) return [];
		return await this.deps.webSearchService.search(userQuery);
	}

	private parseToolArguments(raw: string): Record<string, unknown> {
		try {
			const parsed = JSON.parse(raw) as unknown;
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	private createAssistantWithCalls(
		model: string,
		content: string,
		reasoning: string,
		pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
	): AssistantWithCalls {
		return {
			role: 'assistant',
			content,
			model,
			tool_calls: pendingToolCalls.map(toolCall => ({
				id: toolCall.id,
				type: 'function' as const,
				function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
			})),
			reasoning_content: reasoning || undefined,
		};
	}

	private async executeTools(
		pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
		resolvedTools: RegisteredTool[],
		consecutiveFailures: Map<string, number>,
		callbacks: AgentLoopCallbacks,
	): Promise<ToolResultEntry[]> {
		const entries: ToolResultEntry[] = [];
		for (const toolCall of pendingToolCalls) {
			callbacks.onToolCall(toolCall.name, toolCall.arguments, undefined, 'act');
			const isAllowed = resolvedTools.some(tool => tool.llmName === toolCall.name);
			const result = isAllowed
				? await this.deps.toolRegistry.executeTool(toolCall.name, toolCall.arguments)
				: { success: false, error: `Tool "${toolCall.name}" is not enabled for this agent` };

			if (result.success) {
				consecutiveFailures.delete(toolCall.name);
			} else {
				const failures = (consecutiveFailures.get(toolCall.name) ?? 0) + 1;
				consecutiveFailures.set(toolCall.name, failures);
				if (failures >= MAX_CONSECUTIVE_FAILURES) {
					throw new Error(`Tool "${toolCall.name}" failed ${failures} consecutive times.`);
				}
			}

			const output = result.success ? JSON.stringify(result.result) : `Tool "${toolCall.name}" failed: ${result.error ?? 'Unknown error'}`;
			callbacks.onToolResult(toolCall.name, result.success, output, 'act');
			entries.push({ role: 'tool', content: output, tool_call_id: toolCall.id });
		}
		return entries;
	}
}

function deduplicateWorkingMessages(messages: AgentWorkingMessage[]): AgentWorkingMessage[] {
	if (messages.length <= 1) return messages;
	const result: AgentWorkingMessage[] = [messages[0]];
	for (let i = 1; i < messages.length; i++) {
		const prev = messages[i - 1];
		const cur = messages[i];
		if (cur.role === prev.role && cur.content === prev.content) {
			continue;
		}
		result.push(cur);
	}
	return result;
}
