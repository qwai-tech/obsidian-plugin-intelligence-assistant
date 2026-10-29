import type { ChatRequest } from '@/features/llm/types/llm';
import type { AgentWorkingMessage, AssistantWithCalls } from '../types';
import type { Budget } from './budget';
import type { FinishReason, KernelEvent, TokenUsage, ToolCallRequest } from '@/features/agent/types/agent-run';
import type { JsonValue } from '@/features/agent/types/agent-run';

export interface ModelTurn {
	text: string;
	reasoning: string;
	calls: ToolCallRequest[];
	usage?: TokenUsage;
}

export interface ContextAssembler {
	request(history: AgentWorkingMessage[], forceTool: string | undefined, signal: AbortSignal): ChatRequest;
}

export interface ModelPort {
	turn(request: ChatRequest, emit: (event: KernelEvent) => void): Promise<ModelTurn>;
}

export interface ToolOutcome {
	ok: boolean;
	value: JsonValue;
	output: string;
	proposal: boolean;
}

export interface ToolRunner {
	run(call: ToolCallRequest): Promise<ToolOutcome>;
}

export interface RunView {
	proposalsCreated: number;
}

export type GuardVerdict =
	| { kind: 'pass' }
	| { kind: 'retry'; message: string; correction: string; placeholder: string; forceTool?: string }
	| { kind: 'answer'; answer: string };

export interface TurnGuard {
	readonly name: string;
	check(turn: ModelTurn, run: RunView): GuardVerdict;
}

export interface TurnKernelParts {
	context: ContextAssembler;
	model: ModelPort;
	tools: ToolRunner;
	guards: TurnGuard[];
	budget: Budget;
}

export interface RunTask {
	runId: string;
	history: AgentWorkingMessage[];
}

export interface RunOutcome {
	reason: FinishReason;
	answer: string;
}

export class TurnKernel {
	constructor(private readonly parts: TurnKernelParts) {}

	async run(task: RunTask, signal: AbortSignal, emit: (event: KernelEvent) => void): Promise<RunOutcome> {
		const { budget } = this.parts;
		const history = [...task.history];
		const view: RunView = { proposalsCreated: 0 };
		let forceTool: string | undefined;
		let lastText = '';
		const finish = (reason: FinishReason, answer = lastText): RunOutcome => {
			emit({ type: 'run_finished', reason, answer });
			return { reason, answer };
		};

		emit({ type: 'run_started', runId: task.runId, stepLimit: budget.stepLimit });
		for (let turnNumber = 1; ; turnNumber++) {
			const stop = signal.aborted ? { kind: 'aborted' as const } : budget.exhausted();
			if (stop) {
				return finish(stop);
			}
			emit({ type: 'turn_started', turn: turnNumber });

			let turn: ModelTurn;
			try {
				turn = await this.parts.model.turn(this.parts.context.request(history, forceTool, signal), emit);
			} catch (error) {
				if (signal.aborted) {
					return finish({ kind: 'aborted' });
				}
				throw error;
			}
			forceTool = undefined;
			if (turn.usage) {
				emit({ type: 'usage', turn: turnNumber, usage: turn.usage });
			}
			if (turnNumber === 1) {
				const limitBefore = budget.stepLimit;
				turn = { ...turn, text: budget.estimate(turn.text) };
				if (budget.stepLimit !== limitBefore) {
					emit({ type: 'budget_updated', stepLimit: budget.stepLimit });
				}
			}
			lastText = turn.text;
			if (signal.aborted) {
				return finish({ kind: 'aborted' });
			}

			if (turn.calls.length === 0) {
				const verdict = this.firstVerdict(turn, view);
				if (verdict.kind === 'retry') {
					emit({ type: 'guard_triggered', guard: verdict.guard, message: verdict.message });
					history.push({ role: 'assistant', content: turn.text.trim() || verdict.placeholder });
					history.push({ role: 'user', content: verdict.correction });
					forceTool = verdict.forceTool;
					continue;
				}
				return finish({ kind: 'answered' }, verdict.kind === 'answer' ? verdict.answer : turn.text);
			}

			history.push(assistantWithCalls(turn));
			for (const [index, call] of turn.calls.entries()) {
				const halt = signal.aborted ? { kind: 'aborted' as const } : budget.exhausted();
				if (halt) {
					return finish(halt);
				}
				emit({ type: 'tool_started', call, reasoning: index === 0 ? turn.reasoning || undefined : undefined });
				const outcome = await this.parts.tools.run(call);
				budget.recordTool(call.name, outcome.ok);
				if (outcome.proposal) {
					view.proposalsCreated++;
					emit({ type: 'proposal_created', call });
				}
				emit({ type: 'tool_finished', call, ok: outcome.ok, output: outcome.output, value: outcome.value });
				history.push({ role: 'tool', content: outcome.output, tool_call_id: call.id });
			}
		}
	}

	private firstVerdict(turn: ModelTurn, view: RunView): (GuardVerdict & { kind: 'answer' | 'pass' }) | (GuardVerdict & { kind: 'retry'; guard: string }) {
		for (const guard of this.parts.guards) {
			const verdict = guard.check(turn, view);
			if (verdict.kind === 'retry') {
				return { ...verdict, guard: guard.name };
			}
			if (verdict.kind === 'answer') {
				return verdict;
			}
		}
		return { kind: 'pass' };
	}
}

function assistantWithCalls(turn: ModelTurn): AssistantWithCalls {
	return {
		role: 'assistant',
		content: turn.text,
		tool_calls: turn.calls.map((call) => ({
			id: call.id,
			type: 'function' as const,
			function: { name: call.name, arguments: JSON.stringify(call.arguments) },
		})),
		reasoning_content: turn.reasoning || undefined,
	};
}
