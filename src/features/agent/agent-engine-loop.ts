import { beginTaskAction, finishTaskAction, resolveAgentTask, taskCheckpointContext, taskToolAllowlist } from './task-checkpoint';
import { App } from 'obsidian';
import type { Message } from '@/features/conversations';
import type { RAGSource, MemoryIndex } from '@/features/knowledge';
import type { WebSearchResult, WebSearchService } from '@/features/web-search';
import type { Agent as AppAgent } from '@/features/agent/types/agent';
import { DEFAULT_MAX_STEPS, MAX_STEPS_CEILING } from '@/core/constants';
import type { ToolRegistry as AppToolRegistry, RegisteredTool } from '@/features/tools';
import type { ILLMProvider } from '@/features/llm';
import type { FinishReason, KernelEvent, RunJournal, TokenUsage } from '@/features/agent/types/agent-run';
import type { UsageRecord } from '@/features/usage';
import type { AgentLoopCallbacks, AgentLoopOptions } from './types';
import { HistoryCompactor } from './history-compactor';
import type { AgentSenseService } from './agent-sense-service';
import { TurnKernel } from './kernel/turn-kernel';
import { Budget } from './kernel/budget';
import { AgentContextAssembler } from './kernel/context-assembler';
import { ProviderModelPort } from './kernel/provider-model-port';
import { RunCoordinator } from './run-coordinator';
import { resolveExecutionPolicy } from './execution-policy';
import { RegistryToolRunner } from './kernel/registry-tool-runner';
import { MissingProposalGuard, requiresWriteProposal, selectWriteTool } from './kernel/turn-guards';
import { AGENT_COMPLETION_INSTRUCTION, CompletionGuard } from './kernel/completion-guard';
import { ExecutionCountGuard } from './kernel/execution-count-guard';
import { budgetExecutionReport } from './execution-report';


export type AgentUsageRecorder = (record: UsageRecord) => Promise<void>;

export interface AgentMemoryWriter {
	shouldConsolidate?(agentId: string, interval: number, mode: 'short-term' | 'long-term'): Promise<boolean>;
	setPreference(agentId: string, key: string, value: string, options?: { mode?: 'short-term' | 'long-term'; maxEntries?: number }): Promise<void>;
	appendResearchLog(agentId: string, entry: string, options?: { mode?: 'short-term' | 'long-term'; maxEntries?: number }): Promise<void>;
}

interface AgentEngineLoopDeps {
	app?: App;
	toolRegistry: AppToolRegistry;
	senseService: AgentSenseService;
	historyCompactor: HistoryCompactor;
	webSearchService: WebSearchService;
	memoryIndex?: MemoryIndex;
	memoryWriter?: AgentMemoryWriter;
	journal?: RunJournal;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	recordUsage?: AgentUsageRecorder;
	defaultModel?: () => string | undefined;
	runs?: RunCoordinator;
}

const MAX_FAILURES = 3;

export class AgentEngineLoop {
	private readonly runs: RunCoordinator;
	constructor(private readonly deps: AgentEngineLoopDeps) { this.runs = deps.runs ?? new RunCoordinator(); }

	execute(messages: Message[], options: AgentLoopOptions, callbacks: AgentLoopCallbacks): Promise<void> {
		if (options.authorization?.approved === false) { callbacks.onError(new Error('This task has not been approved in the host')); return Promise.resolve(); }
		const snapshot = JSON.parse(JSON.stringify(options)) as AgentLoopOptions;
		return this.runs.run(callbacks.signal, async lease => {
			await this.executeOwned(JSON.parse(JSON.stringify(messages)) as Message[], snapshot, {
				...callbacks, signal: lease.signal,
				onComplete: message => { lease.finish(lease.signal.aborted ? 'aborted' : 'completed'); callbacks.onComplete(message); },
				onError: error => { lease.finish(lease.signal.aborted ? 'aborted' : 'failed'); callbacks.onError(error); },
			}, lease.id);
		});
	}

	private async executeOwned(messages: Message[], options: AgentLoopOptions, callbacks: AgentLoopCallbacks, runId: string): Promise<void> {
		try {
			const providerBundle = this.deps.createProvider(options.model);
			if (!providerBundle) {
				callbacks.onError(new Error(`No provider configuration found for model: ${options.model}`));
				return;
			}

			const currentUser = [...messages].reverse().find(m => m.role === 'user');
			if (!currentUser) throw new Error('The task has no user request.');
			const task = currentUser.agentTask?.version === 1 ? JSON.parse(JSON.stringify(currentUser.agentTask)) as NonNullable<Message['agentTask']> : resolveAgentTask(messages, currentUser);
			const currentRun = { id: runId, retainedReadVisitsAtStart: task.observations.filter(o => o.tool === 'read_file').reduce((sum, o) => sum + o.visits, 0), successfulCalls: 0, successfulReadFileCalls: 0, readFileCallsByArguments: {} as Record<string, number> };
			const directive = taskToolAllowlist(task.originalGoal);
			task.allowedTools = directive === undefined ? task.allowedTools : task.allowedTools === undefined ? directive : task.allowedTools.filter(name => directive.includes(name));
			if (options.allowedTools !== undefined) task.allowedTools = task.allowedTools === undefined ? options.allowedTools : task.allowedTools.filter(name => options.allowedTools!.includes(name));
			options = { ...options, allowedTools: task.allowedTools };
			const activeAgent = this.getActiveAgent(options);
			const policy = resolveExecutionPolicy(activeAgent, options.authorization);
			const memoryAgentId = activeAgent && keepsMemory(activeAgent) ? activeAgent.id : undefined;
			const fallbackSteps = activeAgent?.maxSteps ?? DEFAULT_MAX_STEPS;
			const userQuery = [...messages].reverse().find(message => message.role === 'user')?.content ?? '';
			const sense = await this.deps.senseService.sense({
				userQuery,
				model: options.model,
				defaultModel: this.deps.defaultModel?.(),
				enableRAG: options.enableRAG,
				agentId: memoryAgentId,
				memoryMode: activeAgent?.memoryType ?? 'none',
				signal: callbacks.signal,
				references: options.references,
			});
			const ragSources: RAGSource[] = [...sense.ragSources];
			const webResults = await this.loadWebResults(options.userText ?? '', options, callbacks.signal);
			messages = messages.filter(m => !(m.role === 'system' && m.content.startsWith('Logical task checkpoint.'))).map(m => { const copy = { ...m }; delete copy.agentTask; return copy; });
			const systemMessages = this.buildBaseSystemMessages(options, activeAgent, this.deps.senseService.formatSenseContext(sense), webResults);
			const resolvedTools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} }).filter(tool => task.allowedTools === undefined || task.allowedTools.includes(tool.llmName));
			const nativeTools = this.deps.toolRegistry.toOpenAIFunctions(resolvedTools);
			const enabledNames = nativeTools.map((tool) => tool.function.name);
			// A previous task (or quoted context) must not require a new write.
			const writeRequired = requiresWriteProposal(options.expectsWriteProposal, [userQuery]);

			const toolRunner = new RegistryToolRunner({
				registry: this.deps.toolRegistry,
				enabled: new Set(enabledNames),
				known: new Set(this.getAllRegisteredTools(resolvedTools).map((tool) => tool.llmName)),
				autonomous: policy.autonomousWrite,
				bindings: new Map(resolvedTools.map(tool => [tool.llmName, tool])),
				app: this.deps.app as App,
				taskAllowed: task.allowedTools === undefined ? undefined : new Set(task.allowedTools),
			});
			const kernel = new TurnKernel({
				context: new AgentContextAssembler({
					options,
					historyCompactor: this.deps.historyCompactor,
					systemMessages,
					tools: nativeTools,
					contextWindow: options.contextWindow ?? activeAgent?.contextWindow ?? 20,
					executionContext: () => [taskCheckpointContext(task, currentRun), ...toolRunner.evidenceContext()],
				}),
				model: new ProviderModelPort(providerBundle.provider),
				tools: toolRunner,
				guards: [new MissingProposalGuard({ required: writeRequired, writeTool: selectWriteTool(enabledNames) }), new ExecutionCountGuard(() => ({ thisRunReads: currentRun.successfulReadFileCalls, previousRun: task.lastRun && { id: task.lastRun.id, thisRunReads: task.lastRun.successfulReadFileCalls } })), new CompletionGuard()],
				budget: new Budget({ fallbackSteps, ceiling: Math.max(MAX_STEPS_CEILING, fallbackSteps), maxFailures: MAX_FAILURES }),
			});

			const run = new RunRecorder(callbacks);
			const outcome = await kernel.run(
				{ runId, history: [...messages] },
				callbacks.signal ?? new AbortController().signal,
				(event) => {
					if (event.type === 'tool_started') beginTaskAction(task, event.call);
					if (event.type === 'tool_finished') {
						const actionKey = finishTaskAction(task, event.call, event.ok, event.output, event.dispatched === false);
						if (event.ok) {
							currentRun.successfulCalls++;
							if (event.call.name === 'read_file') {
								currentRun.successfulReadFileCalls++;
								if (actionKey) currentRun.readFileCallsByArguments[actionKey] = (currentRun.readFileCallsByArguments[actionKey] ?? 0) + 1;
							}
						}
					}
					run.handle(event);
					void this.deps.journal?.append(runId, event).catch(error => console.error('[RunJournal] Event could not be saved:', error));
				},
			);

			await this.deps.journal?.flush?.();
			const failure = failureMessage(outcome.reason);
			if (failure) {
				callbacks.onError(new Error(failure));
				return;
			}
			const finalContent = outcome.reason.kind === 'budget' && outcome.reason.limit === 'steps'
				? this.reportBudgetStop(callbacks, outcome.reason.steps, currentRun.successfulReadFileCalls)
				: outcome.answer;
			task.lastRun = { id: runId, successfulCalls: currentRun.successfulCalls, successfulReadFileCalls: currentRun.successfulReadFileCalls, outcome: outcome.reason.kind };

			callbacks.onComplete({
				role: 'assistant',
				agentTask: task,
				content: finalContent,
				model: options.model,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: run.usage,
				reasoningContent: run.reasoning || undefined,
			});

			try {
				if (memoryAgentId && this.deps.memoryWriter && outcome.reason.kind === 'answered' && !callbacks.signal?.aborted) {
					const mode = activeAgent?.memoryType === 'short-term' ? 'short-term' : 'long-term';
					const due = await this.deps.memoryWriter.shouldConsolidate?.(memoryAgentId, activeAgent?.memoryConfig?.summaryInterval ?? 1, mode) ?? true;
					if (due) await this.consolidateMemory(memoryAgentId, this.deps.memoryWriter, messages, finalContent, options, callbacks.signal);
				}
			} catch (memoryError) { console.error('[AgentEngineLoop] Memory bookkeeping failed after task completion:', memoryError); }

		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			try { await this.deps.journal?.append(runId, { type: 'run_finished', reason: callbacks.signal?.aborted ? { kind: 'aborted' } : { kind: 'fatal', error: failure.message }, answer: '' }); await this.deps.journal?.flush?.(); }
			catch (journalError) { console.error('[RunJournal] Terminal event could not be saved:', journalError); }
			callbacks.onError(failure);
		}
	}

	private reportBudgetStop(callbacks: AgentLoopCallbacks, steps: number, successfulReadFileCalls: number): string {
		callbacks.onThought(`Reached the agent step budget of ${steps}.`, 'reflect');
		return budgetExecutionReport(steps, successfulReadFileCalls);
	}

	private async consolidateMemory(agentId: string, writer: AgentMemoryWriter, history: Message[], finalOutput: string, options: AgentLoopOptions, signal?: AbortSignal): Promise<void> {
		try {
			const providerBundle = this.deps.createProvider(options.model);
			if (!providerBundle) return;

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
				model: options.model, signal, conversationId: options.conversationId, purpose: 'memory',
				messages: [{ role: 'user', content: reflectionPrompt }],
				temperature: 0.1,
				maxTokens: 1000,
				responseFormat: { type: 'json_object' },
			});
			const agent = this.getActiveAgent(options);
			const memoryOptions = { signal, mode: agent?.memoryType === 'short-term' ? 'short-term' as const : 'long-term' as const, maxEntries: agent?.memoryConfig?.maxMemories ?? 50 };
			signal?.throwIfAborted();
			const reflectionResponse = response.content;

			// Simple JSON extraction from response (it might be wrapped in markdown)
			const jsonMatch = reflectionResponse.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const data = JSON.parse(jsonMatch[0]) as {
					preferences?: Record<string, unknown>;
					newResearchEntries?: string[];
				};
				if (data.preferences) {
					for (const [key, value] of Object.entries(data.preferences)) {
						signal?.throwIfAborted();
						await writer.setPreference(agentId, key, String(value), memoryOptions);
					}
				}
				if (data.newResearchEntries) {
					for (const entry of data.newResearchEntries) {
						signal?.throwIfAborted();
						await writer.appendResearchLog(agentId, entry, memoryOptions);
						// Index new memory entry in RAG
						if (this.deps.memoryIndex) {
							await this.deps.memoryIndex.indexMemory(agentId, entry, memoryOptions);
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
			{ role: 'system', context: true, content: senseContext },
			{ role: 'system', content: this.buildAgentInstruction(options.isGenericAgent ?? !options.agentId, activeAgent, options) },
			...(options.activeSystemPrompts ?? []),
		];
		if (webResults.length > 0) {
			messages.push({ role: 'system', context: true, content: this.deps.webSearchService.formatResultsAsContext(webResults) });
		}
		return messages;
	}

	private buildAgentInstruction(isGenericAgent: boolean, activeAgent: AppAgent | undefined, options: AgentLoopOptions): string {
		const tools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} }).filter(tool => options.allowedTools === undefined || options.allowedTools.includes(tool.llmName));
		const toolDescriptions = tools.map(tool => `- ${tool.llmName}: ${tool.definition.description}`).join('\n');
		const agentName = isGenericAgent ? 'the default Obsidian knowledge agent' : `Agent "${activeAgent?.name ?? 'unknown'}"`;
		return [
			`You are ${agentName}.`,
			AGENT_COMPLETION_INSTRUCTION,
			'Run a Sense-Plan-Act-Reflect loop for Obsidian knowledge work.',
			'In your first "Plan" phase for a complex task, start by providing a "Task Checklist" using markdown checkboxes (- [ ]). This helps the user understand your intended steps.',
			'On your first turn, after the Task Checklist, output an HTML comment of the exact form `<!-- ESTIMATED_STEPS: N -->` where N is your realistic estimate of how many tool-using steps the whole task needs (e.g. roughly one or two steps per note you will create or edit). This sets your working step budget, so estimate generously enough to finish.',
			'Use vault context before external context.',
			resolveExecutionPolicy(activeAgent, options.authorization).autonomousWrite
				? 'Vault writes may be applied using this agent’s explicit autonomous-write setting. Only claim success when the tool reports applied.'
				: 'Vault writes require a user-approved proposal. Never claim a write was applied before approval.',
			'When your plan calls for creating or changing notes, you MUST call the matching tool (such as create_note or write_file) in that same turn so a write proposal is generated. Do NOT end your turn by only describing notes you intend to create — describing without calling the tool produces nothing for the user. If several notes are needed, create them one tool call per note across successive turns until the task is complete.',
			'Do NOT stop mid-task to narrate progress. After each tool result, immediately call the tool for the NEXT item in your Task Checklist — never reply with text like "now I will create…" or "继续创建…" without an actual tool call. Only write your final summary once EVERY planned note has been created.',
			toolDescriptions ? `Available tools:\n${toolDescriptions}` : 'No tools are enabled for this agent.',
		].join('\n\n');
	}

	private async loadWebResults(userQuery: string, options: AgentLoopOptions, signal?: AbortSignal): Promise<WebSearchResult[]> {
		if (!options.enableWebSearch) return [];
		return await this.deps.webSearchService.search(userQuery, { signal });
	}
}

class RunRecorder {
	readonly usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
	reasoning = '';

	constructor(private readonly callbacks: AgentLoopCallbacks) {}

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

function keepsMemory(agent: Pick<AppAgent, 'memoryType'>): boolean {
	return agent.memoryType === 'short-term' || agent.memoryType === 'long-term';
}
