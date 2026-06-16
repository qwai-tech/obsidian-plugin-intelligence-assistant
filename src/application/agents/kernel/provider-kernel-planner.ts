import type { Message } from '@/types';
import type { ChatRequest, ILLMProvider, StreamChunk } from '@/types/common/llm';
import type { ToolRegistry as AppToolRegistry } from '@/application/tools/tool-registry';
import type { AgentLoopCallbacks, AgentLoopOptions, AgentWorkingMessage, AssistantWithCalls } from '../types';
import type { HistoryCompactor } from '../history-compactor';
import type { Action, AgentContext, JsonObject, Planner } from './agent-engine-core';
import { deduplicateWorkingMessages, sanitizeToolCallHistory } from './agent-message-history';
import { parseToolArguments, serializeToolResult } from './json-utils';

export type NativeToolDefinition = ReturnType<AppToolRegistry['toOpenAIFunctions']>[number];

export type AgentUsageRecorder = (record: {
	model: string;
	provider: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	timestamp: number;
	conversationId?: string;
}) => Promise<void>;

type PendingToolCall = {
	id: string;
	name: string;
	arguments: JsonObject;
};

type PendingToolGroup = {
	assistant: AssistantWithCalls;
	toolCalls: PendingToolCall[];
	nextIndex: number;
};

const WRITE_PROPOSAL_RETRY_LIMIT = 1;
const WRITE_PROPOSAL_MARKERS = [
	'write proposal',
	'proposal/review queue',
	'call create_note or write_file',
	'call create_note',
	'call write_file',
];
const WRITE_PROPOSAL_TOOL_PRIORITY = ['create_note', 'write_file', 'append_to_note'];

/**
 * An empty turn (no content AND no tool call) is almost always a truncated tool
 * call (output exceeded maxTokens) or an empty model response — not a real
 * completion. Retry with guidance up to this many times before giving up, so the
 * agent never silently finishes having done nothing.
 */
const MAX_EMPTY_RESPONSE_RETRIES = 2;
const EMPTY_RESPONSE_CORRECTION =
	'Your previous response was empty. This usually means the output token limit truncated a large tool call, or you returned no tool call. Continue the task now by calling the next required tool. If a single item is too large to write in one tool call, write shorter content or split it across several tool calls.';
const EMPTY_RESPONSE_FINAL_MESSAGE =
	'The model repeatedly returned empty responses, likely because the output token limit truncated a large tool call. Try increasing the agent\'s Max Tokens, or split the work into smaller steps with shorter content per tool call.';

/** Floor for an agent-estimated step budget, and the slack added to its estimate. */
const MIN_ESTIMATED_BUDGET = 10;
const ESTIMATE_BUFFER = 3;
/** Matches the agent's first-turn budget marker, e.g. `<!-- ESTIMATED_STEPS: 12 -->`. */
const ESTIMATED_STEPS_RE = /<!--\s*ESTIMATED_STEPS:\s*(\d+)\s*-->/i;

export interface ProviderKernelPlannerOptions {
	messages: AgentWorkingMessage[];
	options: AgentLoopOptions;
	callbacks: AgentLoopCallbacks;
	provider: ILLMProvider;
	providerId: string;
	recordUsage?: AgentUsageRecorder;
	historyCompactor: HistoryCompactor;
	baseSystemMessages: Message[];
	nativeTools: NativeToolDefinition[];
	contextWindow: number;
	/** Step budget used until (and if) the agent declares its own estimate. */
	fallbackBudget: number;
	/** Hard ceiling the agent's estimate can never exceed. */
	maxBudgetCeiling: number;
}

export class ProviderKernelPlanner implements Planner {
	lastContent = '';
	lastReasoning = '';
	lastStepUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
	cumulativeUsage: { promptTokens: number; completionTokens: number; totalTokens: number } = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0
	};
	fatalStopReason: string | null = null;
	private readonly workingMessages: AgentWorkingMessage[];
	private pendingGroup: PendingToolGroup | null = null;

	/**
	 * Reasoning attached to the tool-call batch currently being executed.
	 *
	 * The kernel's `ToolContext` no longer carries the triggering action (that
	 * coupling was removed in @agentic-kernel/core), so the tool-registry adapter
	 * reads the reasoning from here instead. All tool calls in a batch share the
	 * one assistant `reasoning_content`, which is exactly this value.
	 */
	get currentActionReason(): string | undefined {
		return this.pendingGroup?.assistant.reasoning_content;
	}
	private actionSequence = 0;
	private writeProposalRetryCount = 0;
	private emptyResponseRetryCount = 0;
	/** Effective step budget: starts at the fallback, updated once from the agent's estimate. */
	private softBudget: number;
	private budgetEstimated = false;

	constructor(private readonly plannerOptions: ProviderKernelPlannerOptions) {
		this.workingMessages = [...plannerOptions.messages];
		this.softBudget = plannerOptions.fallbackBudget;
	}

	/** The step budget currently in effect (agent estimate if declared, else fallback). */
	get effectiveBudget(): number {
		return this.softBudget;
	}

	async plan(context: AgentContext): Promise<Action> {
		if (this.plannerOptions.callbacks.checkAbort?.()) {
			return this.stopAction('aborted');
		}

		if (this.fatalStopReason) {
			return this.stopAction(this.fatalStopReason);
		}

		if (context.state.step >= this.softBudget) {
			return this.stopAction('max_steps_reached');
		}

		const bufferedAction = this.nextBufferedToolAction();
		if (bufferedAction) {
			return bufferedAction;
		}

		this.commitPendingGroup(context);
		let forceWriteProposalTool = false;

		for (;;) {
			const request = this.buildChatRequest({ forceWriteProposalTool });
			const pendingToolCalls: PendingToolCall[] = [];
			const stepCapture: { usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null } = { usage: null };
			this.lastReasoning = '';

			this.lastContent = '';
			await this.plannerOptions.provider.streamChat(request, (chunk: StreamChunk) => {
				if (this.plannerOptions.callbacks.checkAbort?.()) return;
				if (chunk.content) {
					this.lastContent += chunk.content;
					this.plannerOptions.callbacks.onChunk(chunk);
				}
				if (chunk.reasoning) this.lastReasoning += chunk.reasoning;
				if (chunk.usage) stepCapture.usage = chunk.usage;
				if (chunk.toolCalls) {
					for (const toolCall of chunk.toolCalls) {
						pendingToolCalls.push({
							id: toolCall.id,
							name: toolCall.function.name,
							arguments: parseToolArguments(toolCall.function.arguments),
						});
					}
				}
			});

			this.lastStepUsage = stepCapture.usage;
			if (this.lastStepUsage) {
				this.cumulativeUsage.promptTokens += this.lastStepUsage.promptTokens;
				this.cumulativeUsage.completionTokens += this.lastStepUsage.completionTokens;
				this.cumulativeUsage.totalTokens += this.lastStepUsage.totalTokens;

				if (this.plannerOptions.recordUsage) {
					void this.plannerOptions.recordUsage({
						model: this.plannerOptions.options.model,
						provider: this.plannerOptions.providerId,
						promptTokens: this.lastStepUsage.promptTokens,
						completionTokens: this.lastStepUsage.completionTokens,
						totalTokens: this.lastStepUsage.totalTokens,
						timestamp: Date.now(),
						conversationId: this.plannerOptions.options.conversationId,
					});
				}
			}

			if (!this.budgetEstimated) {
				this.applyEstimatedBudget();
				this.budgetEstimated = true;
			}

			if (pendingToolCalls.length === 0) {
				if (this.shouldRetryForMissingWriteProposal(context)) {
					this.writeProposalRetryCount += 1;
					this.workingMessages.push({
						role: 'assistant',
						content: this.lastContent.trim() || 'I did not create the required write proposal yet.',
						model: this.plannerOptions.options.model,
					});
					this.workingMessages.push({
						role: 'user',
						content: this.buildWriteProposalCorrection(),
					});
					this.plannerOptions.callbacks.onThought(
						'Model ended before creating the required write proposal; retrying with a forced write-proposal tool call.',
						'reflect',
					);
					forceWriteProposalTool = true;
					continue;
				}

				// Empty turn (no content, no tool call): almost always a truncated/dropped
				// tool call or an empty model response — not a real completion. Retry with
				// guidance before giving up so the agent never silently finishes empty.
				if (this.lastContent.trim() === '' && this.emptyResponseRetryCount < MAX_EMPTY_RESPONSE_RETRIES) {
					this.emptyResponseRetryCount += 1;
					this.workingMessages.push({
						role: 'assistant',
						content: '(empty response)',
						model: this.plannerOptions.options.model,
					});
					this.workingMessages.push({
						role: 'user',
						content: EMPTY_RESPONSE_CORRECTION,
					});
					this.plannerOptions.callbacks.onThought(
						'Model returned an empty response (likely a truncated tool call or empty output); retrying with guidance.',
						'reflect',
					);
					continue;
				}

				const exhaustedEmpty = this.lastContent.trim() === ''
					&& this.emptyResponseRetryCount >= MAX_EMPTY_RESPONSE_RETRIES;
				return {
					id: this.nextActionId(),
					type: 'final_answer',
					content: exhaustedEmpty ? EMPTY_RESPONSE_FINAL_MESSAGE : this.lastContent,
					createdAt: new Date().toISOString(),
				};
			}

			this.pendingGroup = {
				assistant: this.createAssistantWithCalls(this.lastContent, this.lastReasoning, pendingToolCalls),
				toolCalls: pendingToolCalls,
				nextIndex: 0,
			};
			return this.nextBufferedToolAction() ?? this.stopAction('empty_tool_call_buffer');
		}
	}

	private buildChatRequest(options: { forceWriteProposalTool?: boolean } = {}): ChatRequest {
		const compacted = this.plannerOptions.historyCompactor.compact(this.workingMessages);
		const deduped = deduplicateWorkingMessages(compacted.messages);
		const truncated = deduped.length > this.plannerOptions.contextWindow
			? deduped.slice(-this.plannerOptions.contextWindow)
			: deduped;
		const allMessages = sanitizeToolCallHistory([...this.plannerOptions.baseSystemMessages, ...truncated]);
		const nativeTools = this.plannerOptions.nativeTools;
		const forcedWriteTool = options.forceWriteProposalTool
			? this.selectWriteProposalTool(nativeTools)
			: null;
		return {
			messages: allMessages as Message[],
			model: this.plannerOptions.options.model,
			temperature: this.plannerOptions.options.temperature,
			maxTokens: this.plannerOptions.options.maxTokens,
			topP: this.plannerOptions.options.topP,
			frequencyPenalty: this.plannerOptions.options.frequencyPenalty,
			presencePenalty: this.plannerOptions.options.presencePenalty,
			tools: nativeTools.length > 0 ? nativeTools : undefined,
			toolChoice: forcedWriteTool
				? { type: 'function', function: { name: forcedWriteTool } }
				: nativeTools.length > 0 ? 'auto' : undefined,
		};
	}

	private shouldRetryForMissingWriteProposal(context: AgentContext): boolean {
		return this.writeProposalRetryCount < WRITE_PROPOSAL_RETRY_LIMIT
			&& this.requiresWriteProposal(context)
			&& !this.hasObservedWriteProposal(context)
			&& this.selectWriteProposalTool(this.plannerOptions.nativeTools) !== null;
	}

	private requiresWriteProposal(context: AgentContext): boolean {
		// Prefer the structured, language-independent signal when the caller set it.
		// This avoids depending on specific English phrases appearing in the prompt,
		// which breaks for localized or rephrased instructions.
		const explicit = this.plannerOptions.options.expectsWriteProposal;
		if (explicit !== undefined) {
			return explicit;
		}

		// Fallback: legacy marker detection over the task input and user/system prompts.
		const haystack = [
			context.task.input,
			...this.workingMessages
				.filter(message => message.role === 'user' || message.role === 'system')
				.map(message => message.content),
		].join('\n').toLowerCase();
		return WRITE_PROPOSAL_MARKERS.some(marker => haystack.includes(marker));
	}

	private hasObservedWriteProposal(context: AgentContext): boolean {
		return context.recentObservations.some(observation => isWriteProposalValue(observation.result));
	}

	private buildWriteProposalCorrection(): string {
		return [
			'You ended the previous turn without creating the required write proposal.',
			'Call create_note or write_file now with the complete proposed artifact content.',
			'Do not only describe what you will do. The UI needs the tool result to render an Apply-able write proposal card.',
		].join('\n');
	}

	private selectWriteProposalTool(nativeTools: NativeToolDefinition[]): string | null {
		for (const preferredName of WRITE_PROPOSAL_TOOL_PRIORITY) {
			const tool = nativeTools.find(candidate => isToolName(candidate.function.name, preferredName));
			if (tool) return tool.function.name;
		}
		return null;
	}

	private nextBufferedToolAction(): Action | null {
		if (!this.pendingGroup || this.pendingGroup.nextIndex >= this.pendingGroup.toolCalls.length) {
			return null;
		}
		const toolCall = this.pendingGroup.toolCalls[this.pendingGroup.nextIndex];
		const isFirstInBatch = this.pendingGroup.nextIndex === 0;
		this.pendingGroup.nextIndex += 1;
		return {
			id: toolCall.id,
			type: 'tool_call',
			toolName: toolCall.name,
			arguments: toolCall.arguments,
			reason: isFirstInBatch ? this.pendingGroup.assistant.reasoning_content : undefined,
			createdAt: new Date().toISOString(),
		};
	}

	private commitPendingGroup(context: AgentContext): void {
		if (!this.pendingGroup || this.pendingGroup.nextIndex < this.pendingGroup.toolCalls.length) {
			return;
		}

		this.workingMessages.push(this.pendingGroup.assistant);
		for (const toolCall of this.pendingGroup.toolCalls) {
			const observation = context.recentObservations.find(item => item.actionId === toolCall.id);
			this.workingMessages.push({
				role: 'tool',
				content: observation?.success ? serializeToolResult(observation.result) : observation?.error ?? `Tool "${toolCall.name}" failed: Unknown error`,
				tool_call_id: toolCall.id,
			});
		}
		this.pendingGroup = null;
	}

	/**
	 * Parse the agent's first-turn `<!-- ESTIMATED_STEPS: N -->` marker and set the
	 * working step budget to clamp(N + buffer, floor, ceiling). The marker is an
	 * HTML comment so it stays invisible in rendered markdown; we also strip it
	 * from lastContent so it never leaks into history or the final answer. If no
	 * marker is present the fallback budget is kept.
	 */
	private applyEstimatedBudget(): void {
		const match = this.lastContent.match(ESTIMATED_STEPS_RE);
		if (!match) {
			return;
		}
		const estimate = parseInt(match[1], 10);
		if (Number.isFinite(estimate) && estimate > 0) {
			this.softBudget = Math.max(
				MIN_ESTIMATED_BUDGET,
				Math.min(estimate + ESTIMATE_BUFFER, this.plannerOptions.maxBudgetCeiling),
			);
		}
		this.lastContent = this.lastContent.replace(new RegExp(ESTIMATED_STEPS_RE.source, 'ig'), '').trimEnd();
	}

	private createAssistantWithCalls(
		content: string,
		reasoning: string,
		pendingToolCalls: PendingToolCall[],
	): AssistantWithCalls {
		return {
			role: 'assistant',
			content,
			model: this.plannerOptions.options.model,
			tool_calls: pendingToolCalls.map(toolCall => ({
				id: toolCall.id,
				type: 'function' as const,
				function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
			})),
			reasoning_content: reasoning || undefined,
		};
	}

	private stopAction(reason: string): Action {
		return {
			id: this.nextActionId(),
			type: 'stop',
			reason,
			createdAt: new Date().toISOString(),
		};
	}

	private nextActionId(): string {
		this.actionSequence += 1;
		return `planner-action-${this.actionSequence}`;
	}
}

function isToolName(candidate: string, baseName: string): boolean {
	return candidate === baseName || candidate.startsWith(`${baseName}_`);
}

function isWriteProposalValue(value: unknown): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	return (value as Record<string, unknown>).type === 'write_proposal';
}
