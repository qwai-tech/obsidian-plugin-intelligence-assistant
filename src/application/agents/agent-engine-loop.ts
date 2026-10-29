import { App } from 'obsidian';
import type { Message, RAGSource, WebSearchResult, Agent as AppAgent } from '@/types';
import { DEFAULT_MAX_STEPS, MAX_STEPS_CEILING } from '@/constants';
import type { ToolRegistry as AppToolRegistry } from '@/application/tools/tool-registry';
import type { WebSearchService } from '@/application/services/web-search-service';
import type { RAGManager } from '@/infrastructure/rag-manager';
import type { RegisteredTool } from '@/types/common/tools';
import type { ILLMProvider } from '@/types/common/llm';
import type { FinishReason, KernelEvent, RunJournal, TokenUsage } from '@/types/features/agent-run';
import type { UsageRecord } from '@/types/features/usage';
import type { AgentLoopCallbacks, AgentLoopOptions } from './types';
import { HistoryCompactor } from './history-compactor';
import type { AgentSenseService } from './agent-sense-service';
import { TurnKernel } from './kernel/turn-kernel';
import { Budget } from './kernel/budget';
import { AgentContextAssembler } from './kernel/context-assembler';
import { ProviderModelPort } from './kernel/provider-model-port';
import { RegistryToolRunner } from './kernel/registry-tool-runner';
import { EmptyTurnGuard, MissingProposalGuard, requiresWriteProposal, selectWriteTool } from './kernel/turn-guards';

const AUTONOMY_INTENT_RE = /(自主完成|自动完成|自动应用|自动创建|不需要(我)?确认|不用确认|无需确认|直接(创建|写入|保存)|don['’]?t ask|without (your )?confirmation|no confirmation|autonomous(ly)?|auto[-\s]?apply|just (create|do it|save))/i;

export type AgentUsageRecorder = (record: UsageRecord) => Promise<void>;

interface AgentEngineLoopDeps {
	app?: App;
	toolRegistry: AppToolRegistry;
	senseService: AgentSenseService;
	historyCompactor: HistoryCompactor;
	webSearchService: WebSearchService;
	ragManager?: RAGManager;
	journal?: RunJournal;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	recordUsage?: AgentUsageRecorder;
	defaultModel?: () => string | undefined;
}

const MAX_FAILURES = 3;

export class AgentEngineLoop {
	constructor(private readonly deps: AgentEngineLoopDeps) {}

	async execute(messages: Message[], options: AgentLoopOptions, callbacks: AgentLoopCallbacks): Promise<void> {
		try {
			const providerBundle = this.deps.createProvider(options.model);
			if (!providerBundle) {
				callbacks.onError(new Error(`No provider configuration found for model: ${options.model}`));
				return;
			}

			const activeAgent = this.getActiveAgent(options);
			const fallbackSteps = activeAgent?.maxSteps ?? DEFAULT_MAX_STEPS;
			const userQuery = messages[messages.length - 1]?.content ?? '';
			const sense = await this.deps.senseService.sense({
				userQuery,
				model: options.model,
				defaultModel: this.deps.defaultModel?.(),
				enableRAG: options.enableRAG,
				agentId: activeAgent?.id,
				references: options.references,
			});
			const ragSources: RAGSource[] = [...sense.ragSources];
			const webResults = await this.loadWebResults(userQuery, options);
			const systemMessages = this.buildBaseSystemMessages(options, activeAgent, this.deps.senseService.formatSenseContext(sense), webResults);
			const resolvedTools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} });
			const nativeTools = this.deps.toolRegistry.toOpenAIFunctions(resolvedTools);
			const enabledNames = nativeTools.map((tool) => tool.function.name);
			const writeRequired = requiresWriteProposal(options.expectsWriteProposal, [
				userQuery,
				...messages.filter((m) => m.role === 'user' || m.role === 'system').map((m) => m.content),
			]);

			const kernel = new TurnKernel({
				context: new AgentContextAssembler({
					options,
					historyCompactor: this.deps.historyCompactor,
					systemMessages,
					tools: nativeTools,
					contextWindow: options.contextWindow ?? activeAgent?.contextWindow ?? 20,
				}),
				model: new ProviderModelPort(providerBundle.provider),
				tools: new RegistryToolRunner({
					registry: this.deps.toolRegistry,
					enabled: new Set(enabledNames),
					known: new Set(this.getAllRegisteredTools(resolvedTools).map((tool) => tool.llmName)),
					autonomous: Boolean(activeAgent?.autonomousWrite) || AUTONOMY_INTENT_RE.test(userQuery),
					app: this.deps.app as App,
				}),
				guards: [new MissingProposalGuard({ required: writeRequired, writeTool: selectWriteTool(enabledNames) }), new EmptyTurnGuard()],
				budget: new Budget({ fallbackSteps, ceiling: Math.max(MAX_STEPS_CEILING, fallbackSteps), maxFailures: MAX_FAILURES }),
			});

			const runId = `run-${Date.now()}`;
			const run = new RunRecorder(callbacks, (usage) => this.recordUsage(usage, providerBundle.providerId, options));
			const outcome = await kernel.run(
				{ runId, history: [...messages] },
				callbacks.signal ?? new AbortController().signal,
				(event) => {
					run.handle(event);
					void this.deps.journal?.append(runId, event);
				},
			);

			const failure = failureMessage(outcome.reason);
			if (failure) {
				callbacks.onError(new Error(failure));
				return;
			}
			const finalContent = outcome.reason.kind === 'budget' && outcome.reason.limit === 'steps'
				? this.reportBudgetStop(callbacks, outcome.answer, outcome.reason.steps)
				: outcome.answer;

			callbacks.onComplete({
				role: 'assistant',
				content: finalContent,
				model: options.model,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: run.usage,
				reasoningContent: run.reasoning || undefined,
			});

			if (activeAgent?.id && this.deps.senseService.memoryService) {
				void this.consolidateMemory(activeAgent.id, messages, finalContent, options);
			}
		} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private reportBudgetStop(callbacks: AgentLoopCallbacks, partial: string, steps: number): string {
		callbacks.onThought(`Reached the agent step budget of ${steps}.`, 'reflect');
		return [
			partial.trim(),
			`Reached the agent step budget of ${steps}. Review the tool results above, or ask me to continue / raise this agent's max steps.`,
		].filter(Boolean).join('\n\n');
	}

	private recordUsage(usage: TokenUsage, providerId: string, options: AgentLoopOptions): void {
		void this.deps.recordUsage?.({
			model: options.model,
			provider: providerId,
			...usage,
			timestamp: Date.now(),
			conversationId: options.conversationId,
		});
	}

	private async consolidateMemory(agentId: string, history: Message[], finalOutput: string, options: AgentLoopOptions): Promise<void> {
		try {
			const providerBundle = this.deps.createProvider(options.model);
			if (!providerBundle || !this.deps.senseService.memoryService) return;

			const memoryService = this.deps.senseService.memoryService;
			const reflectionPrompt = `
Analyze the following conversation between a user and an Obsidian agent.
Extract:
1. User preferences (formatting, tone, specific folders to use/avoid).
2. Key research findings or facts learned during this task.
3. Errors or mistakes the agent made that should be avoided.

Output as JSON:
{
  "preferences": { "key": "value" },
  "newResearchEntries": ["entry 1", "entry 2"]
}

Conversation:
${history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}
assistant: ${finalOutput}
`.trim();

			const response = await providerBundle.provider.chat({
				model: options.model,
				messages: [{ role: 'user', content: reflectionPrompt }],
				temperature: 0.1,
				maxTokens: 1000,
				responseFormat: { type: 'json_object' },
			});
			const reflectionResponse = response.content;

			// Simple JSON extraction from response (it might be wrapped in markdown)
			const jsonMatch = reflectionResponse.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const data = JSON.parse(jsonMatch[0]) as {
					preferences?: Record<string, unknown>;
					newResearchEntries?: string[];
				};
				const writer = memoryService as unknown as {
					setPreference(agentId: string, key: string, value: string): Promise<void>;
					appendResearchLog(agentId: string, entry: string): Promise<void>;
				};
				if (data.preferences) {
					for (const [key, value] of Object.entries(data.preferences)) {
						await writer.setPreference(agentId, key, String(value));
					}
				}
				if (data.newResearchEntries) {
					for (const entry of data.newResearchEntries) {
						await writer.appendResearchLog(agentId, entry);
						// Index new memory entry in RAG
						if (this.deps.ragManager) {
							await this.deps.ragManager.indexMemory(agentId, entry);
						}
					}
				}
			}
		} catch (err) {
			console.error('[AgentEngineLoop] Memory consolidation failed:', err);
		}
	}

	private getActiveAgent(options: AgentLoopOptions): AppAgent | undefined {
		return options.agentId ? (options.agents ?? []).find(agent => agent.id === options.agentId) : undefined;
	}

	private getAllRegisteredTools(fallbackTools: RegisteredTool[]): RegisteredTool[] {
		const registry = this.deps.toolRegistry as AppToolRegistry & { getTools?: () => RegisteredTool[] };
		return typeof registry.getTools === 'function' ? registry.getTools() : fallbackTools;
	}

	private buildBaseSystemMessages(
		options: AgentLoopOptions,
		activeAgent: AppAgent | undefined,
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

	private buildAgentInstruction(isGenericAgent: boolean, activeAgent: AppAgent | undefined): string {
		const tools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} });
		const toolDescriptions = tools.map(tool => `- ${tool.llmName}: ${tool.definition.description}`).join('\n');
		const agentName = isGenericAgent ? 'the default Obsidian knowledge agent' : `Agent "${activeAgent?.name ?? 'unknown'}"`;
		return [
			`You are ${agentName}.`,
			'Run a Sense-Plan-Act-Reflect loop for Obsidian knowledge work.',
			'In your first "Plan" phase for a complex task, start by providing a "Task Checklist" using markdown checkboxes (- [ ]). This helps the user understand your intended steps.',
			'On your first turn, after the Task Checklist, output an HTML comment of the exact form `<!-- ESTIMATED_STEPS: N -->` where N is your realistic estimate of how many tool-using steps the whole task needs (e.g. roughly one or two steps per note you will create or edit). This sets your working step budget, so estimate generously enough to finish.',
			'Use vault context before external context.',
			'Never claim a vault write was applied unless the user approved a write proposal.',
			'When your plan calls for creating or changing notes, you MUST call the matching tool (such as create_note or write_file) in that same turn so a write proposal is generated. Do NOT end your turn by only describing notes you intend to create — describing without calling the tool produces nothing for the user. If several notes are needed, create them one tool call per note across successive turns until the task is complete.',
			'Do NOT stop mid-task to narrate progress. After each tool result, immediately call the tool for the NEXT item in your Task Checklist — never reply with text like "now I will create…" or "继续创建…" without an actual tool call. Only write your final summary once EVERY planned note has been created.',
			toolDescriptions ? `Available tools:\n${toolDescriptions}` : 'No tools are enabled for this agent.',
		].join('\n\n');
	}

	private async loadWebResults(userQuery: string, options: AgentLoopOptions): Promise<WebSearchResult[]> {
		if (!options.enableWebSearch) return [];
		return await this.deps.webSearchService.search(userQuery);
	}
}

class RunRecorder {
	readonly usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
	reasoning = '';

	constructor(private readonly callbacks: AgentLoopCallbacks, private readonly onUsage: (usage: TokenUsage) => void) {}

	handle(event: KernelEvent): void {
		switch (event.type) {
			case 'turn_started':
				this.reasoning = '';
				break;
			case 'reasoning_delta':
				this.reasoning += event.text;
				break;
			case 'text_delta':
				this.callbacks.onChunk({ content: event.text, done: false });
				break;
			case 'tool_started':
				this.callbacks.onToolCall(event.call.name, event.call.arguments, event.reasoning, 'act');
				break;
			case 'tool_finished':
				this.callbacks.onToolResult(event.call.name, event.ok, event.output, 'act');
				break;
			case 'guard_triggered':
				this.callbacks.onThought(event.message, 'reflect');
				break;
			case 'usage':
				this.usage.promptTokens += event.usage.promptTokens;
				this.usage.completionTokens += event.usage.completionTokens;
				this.usage.totalTokens += event.usage.totalTokens;
				this.onUsage(event.usage);
				break;
		}
	}
}

function failureMessage(reason: FinishReason): string | null {
	if (reason.kind === 'fatal') {
		return reason.error;
	}
	if (reason.kind === 'budget' && reason.limit === 'failures') {
		return reason.consecutive
			? `Tool "${reason.tool}" failed ${reason.failures} consecutive times.`
			: `Stopped after ${reason.failures} failed tool calls.`;
	}
	return null;
}

