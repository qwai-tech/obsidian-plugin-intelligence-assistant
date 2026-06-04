import type { Message, RAGSource, WebSearchResult, Agent as AppAgent } from '@/types';
import { DEFAULT_MAX_STEPS } from '@/constants';
import type { ToolRegistry as AppToolRegistry } from '@/application/tools/tool-registry';
import type { WebSearchService } from '@/application/services/web-search-service';
import type { RAGManager } from '@/infrastructure/rag-manager';
import type { RegisteredTool } from '@/types/common/tools';
import type { ILLMProvider } from '@/types/common/llm';
import type {
	AgentLoopCallbacks,
	AgentLoopOptions,
	AgentWorkingMessage,
} from './types';
import { HistoryCompactor } from './history-compactor';
import type { AgentSenseService } from './agent-sense-service';
import {
	BasicPolicy,
	createAgentEngine,
} from './kernel/agent-engine-core';
import type {
	Agent as KernelAgent,
	HostContext,
	StateStore,
	Task as KernelTask,
} from './kernel/agent-engine-core';
import { ProviderKernelPlanner } from './kernel/provider-kernel-planner';
import type { AgentUsageRecorder } from './kernel/provider-kernel-planner';
import { createKernelToolRegistry } from './kernel/kernel-tool-registry-adapter';

interface AgentEngineLoopDeps {
	toolRegistry: AppToolRegistry;
	senseService: AgentSenseService;
	historyCompactor: HistoryCompactor;
	webSearchService: WebSearchService;
	ragManager?: RAGManager;
	agentRunStateStore: StateStore;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	recordUsage?: AgentUsageRecorder;
	defaultModel?: string;
}

const MAX_CONSECUTIVE_FAILURES = 3;

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
			const contextWindow = options.contextWindow ?? activeAgent?.contextWindow ?? 20;
			const maxSteps = activeAgent?.maxSteps ?? DEFAULT_MAX_STEPS;
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
			const allRegisteredTools = this.getAllRegisteredTools(resolvedTools);
			const nativeTools = this.deps.toolRegistry.toOpenAIFunctions(resolvedTools);
			const knownNativeTools = this.deps.toolRegistry.toOpenAIFunctions(allRegisteredTools);
			const consecutiveFailures = new Map<string, number>();
			const planner = new ProviderKernelPlanner({
				messages: workingMessages,
				options,
				callbacks,
				provider: providerBundle.provider,
				providerId: providerBundle.providerId,
				recordUsage: this.deps.recordUsage,
				historyCompactor: this.deps.historyCompactor,
				baseSystemMessages,
				nativeTools,
				contextWindow,
			});
			const kernelTools = createKernelToolRegistry(
				this.deps.toolRegistry,
				resolvedTools,
				nativeTools,
				knownNativeTools,
				consecutiveFailures,
				callbacks,
				planner,
			);
			const engine = createAgentEngine({
				planner,
				toolRegistry: kernelTools,
				stateStore: this.deps.agentRunStateStore,
				policy: new BasicPolicy({
					maxSteps,
					maxFailures: MAX_CONSECUTIVE_FAILURES,
					allowedTools: knownNativeTools.map(tool => tool.function.name),
				}),
			});
			const result = await engine.run({
				agent: this.toKernelAgent(activeAgent, options, resolvedTools, maxSteps),
				task: this.toKernelTask(userQuery),
				host: this.toKernelHost(options),
			});

			if (result.status === 'failed') {
				callbacks.onError(new Error(result.error));
				return;
			}

			if (result.status === 'stopped' && result.reason !== 'aborted' && result.reason !== 'max_steps_reached') {
				callbacks.onError(new Error(result.reason));
				return;
			}

			if (result.status === 'stopped' && result.reason === 'max_steps_reached') {
				callbacks.onThought(`Reached the agent step limit of ${maxSteps}.`, 'reflect');
			}

			const finalContent = result.status === 'completed'
				? result.output
				: [
					planner.lastContent.trim(),
					result.status === 'stopped' && result.reason === 'max_steps_reached'
						? `Reached the agent step limit of ${maxSteps}. Review the tool results above or increase this agent's max steps to continue.`
						: '',
				].filter(Boolean).join('\n\n');

			callbacks.onComplete({
				role: 'assistant',
				content: finalContent,
				model: options.model,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: planner.cumulativeUsage,
				reasoningContent: planner.lastReasoning || undefined,
			});

			// Phase B2: Memory Consolidation Reflection
			if (activeAgent?.id && this.deps.senseService.memoryService) {
				void this.consolidateMemory(activeAgent.id, messages, finalContent, options);
			}
			} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
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
			'Use vault context before external context.',
			'Never claim a vault write was applied unless the user approved a write proposal.',
			'When your plan calls for creating or changing notes, you MUST call the matching tool (such as create_note or write_file) in that same turn so a write proposal is generated. Do NOT end your turn by only describing notes you intend to create — describing without calling the tool produces nothing for the user. If several notes are needed, create them one tool call per note across successive turns until the task is complete.',
			toolDescriptions ? `Available tools:\n${toolDescriptions}` : 'No tools are enabled for this agent.',
		].join('\n\n');
	}

	private async loadWebResults(userQuery: string, options: AgentLoopOptions): Promise<WebSearchResult[]> {
		if (!options.enableWebSearch) return [];
		return await this.deps.webSearchService.search(userQuery);
	}

	private toKernelAgent(
		activeAgent: AppAgent | undefined,
		options: AgentLoopOptions,
		resolvedTools: RegisteredTool[],
		maxSteps: number,
	): KernelAgent {
		return {
			id: activeAgent?.id ?? 'default-agent',
			name: activeAgent?.name ?? 'Intelligence Assistant',
			role: 'obsidian-knowledge-agent',
			goal: 'Help with Obsidian knowledge work using the configured vault tools.',
			instructions: this.buildAgentInstruction(options.isGenericAgent ?? !options.agentId, activeAgent),
			tools: resolvedTools.map(tool => tool.llmName),
			maxSteps,
		};
	}

	private toKernelTask(userQuery: string): KernelTask {
		return {
			id: `task-${Date.now()}`,
			input: userQuery,
			createdAt: new Date().toISOString(),
		};
	}

	private toKernelHost(options: AgentLoopOptions): HostContext {
		return {
			tenantId: 'local',
			workspaceId: options.conversationId ?? 'obsidian-vault',
			principal: {
				id: 'local-user',
				type: 'user',
				tenantId: 'local',
			},
			effectiveScopes: [],
		};
	}
}
