import type { GuardVerdict, ModelTurn, RunView, TurnGuard } from './turn-kernel';

export const AGENT_COMPLETION_INSTRUCTION = [
	'A tool-free progress update is not task completion. Continue with the next permitted tool when work remains.',
	'Only end with a final answer when the requested work and verification are complete, or when genuinely blocked / needing user input.',
	'End the final answer with exactly one status comment: <!-- AGENT_STATUS: complete -->, <!-- AGENT_STATUS: blocked -->, or <!-- AGENT_STATUS: needs_input -->.',
	'For unfinished narration use <!-- AGENT_STATUS: continue --> and keep working; never claim complete just because you described the next operation.',
	'Before closing, check the original user task against actual tool evidence. Do not repeat writes to verify them: inspect their committed artifacts.',
	'Before any call, verify its prerequisites and copy exact identifiers/tokens from actual permitted reads. Never fabricate an opaque value to skip a required read. A source-evidence rejection means no call was executed: read the matching source instead of guessing another value.',
	'Runtime start facts and prior saved execution boundaries identify which observations belong to which run. A recent status does not establish the resume point. Do not infer pre-run history from it.',
	'The latest execution snapshot follows all tool messages and already includes them. Current-run counts reset for each new user message. A previousRun receipt is a separate verified historical scope: do not add it to current counts or withdraw a valid earlier count because a new run has zero calls.',
	'Check every factual claim in both prose and structured output, including values in tables, against recorded evidence. Preserve each value\'s object, unit, and scope: one item or batch, this run, or all runs. A field named total in one item\'s output is not automatically a cumulative total.',
	'Use explicit scope labels. Do not invent aggregate or intermediate totals, claim a check was performed without its result, or generalize one successful sample to the whole task. If evidence is missing or truncated, inspect it with a permitted read tool or state the uncertainty.',
	'An earlier assistant explanation is not evidence for numeric scope. If a tool call targets one object and returns a field called total without defining its scope, describe it only as the total returned for that exact call, or omit it. Do not rename it cumulative, task-wide, or work added this run without independent evidence.',
	'Exact derived quantities require verified computation, not mental arithmetic in prose. Use an available permitted calculation/aggregation tool and its actual result; check that it covers the intended inputs. If an exact requested quantity cannot be verified, disclose that gap and do not claim the whole task is complete. Do not invent precision or silently substitute an estimate.',
].join('\n');

const STATUS = /<!--\s*AGENT_STATUS:\s*(complete|blocked|needs_input|continue)\s*-->\s*$/i;

/** Bounded model reconsideration, without forced tools, extra rights, or thinking changes. */
export class CompletionGuard implements TurnGuard {
	readonly name = 'completion';
	private progress = -1;
	private attempts = 0;
	private verificationRequested = false;

	check(turn: ModelTurn, run: RunView): GuardVerdict {
		if (run.toolResults !== this.progress) { this.progress = run.toolResults; this.attempts = 0; }
		const match = STATUS.exec(turn.text);
		const state = match?.[1].toLowerCase();
		const answer = match ? turn.text.slice(0, match.index).trimEnd() : turn.text;
		if (answer.trim() && (state === 'blocked' || state === 'needs_input')) return { kind: 'answer', answer };
		if (answer.trim() && state === 'complete' && this.verificationRequested) return { kind: 'answer', answer };
		if (this.attempts >= 2) return { kind: 'stop', error: 'The agent stopped without confirming a complete result after two verification attempts. The task is incomplete; inspect the saved tool records before continuing.' };
		this.attempts++;
		const review = state === 'complete' && Boolean(answer.trim());
		// A liveness nudge is not a factual review of a final answer.
		if (review) this.verificationRequested = true;
		if (!review) return {
			kind: 'retry',
			message: 'The agent ended without a confirmed final result; checking whether work remains.',
			placeholder: '(progress acknowledgement already received)',
			includeCandidate: false,
			correction: [
				'Application execution check. The original user task and permissions are unchanged.',
				`The progress acknowledgement has already been received (${this.attempts} no-execution response(s)). Any instruction to acknowledge FIRST has been satisfied. Do not repeat that acknowledgement, restate a plan, or promise a future call.`,
				'If work remains, make the next permitted tool call in this response, starting with any required source read. Copy exact arguments from actual observations; do not invent identifiers or skip prerequisites.',
				'If no permitted action can proceed, explain the specific blocker or missing input with AGENT_STATUS: blocked or needs_input. If the original request only asked for a plan, or work is genuinely complete, provide its final result with AGENT_STATUS: complete. Tool use is not required for such final answers.',
			].join('\n'),
		};
		return {
			kind: 'retry',
			message: review ? 'Checking the proposed final answer against the original task and execution evidence.' : 'The agent ended without a confirmed final result; checking whether work remains.',
			placeholder: '(unconfirmed response)',
			correction: [
				'Application completion check. The original user task and its existing permissions are unchanged.',
				review ? 'Review your proposed final answer against the original task, runtime start facts, and recorded outputs. If anything remains unverified, use the next permitted tool now.' : 'Your last tool-free response is not a confirmed final result. If it only describes pending work, perform the next permitted step now.',
				'Do not force a tool call if the task is already complete, blocked, or needs input. Do not repeat committed writes. Do not guess a recovery start point from the latest status.',
				'Audit factual accuracy throughout the proposed answer, including its final prose. For every number, verify its object, unit, and scope against the recorded output: per-item/per-batch values, work added in THIS run, and cumulative task values are different. A correct JSON total does not excuse an incorrect explanation. Remove unsupported quantities or verify them using permitted read-only tools; never guess missing totals.',
				'Preserve historical run scope. A previousRun receipt remains valid for its own run even if currentRun is zero. Do not falsely correct or withdraw an earlier valid count by comparing it with a different run. Current live counters already include the preceding tool messages; do not add those calls again.',
				'Treat the candidate explanation as potentially false, not as evidence. Reconstruct the explanation from tool outputs independently. In particular, a field named total in a call targeting one item does NOT establish a running/cumulative total. Unless the recorded tool schema or output explicitly establishes cumulative scope, say only "total returned for [exact target/call]", or omit that intermediate number. Only call a value cumulative when its scope is established by aggregate evidence. Do not copy a scope label from the candidate.',
				'Check arithmetic as well as labels. An equation written by the assistant is not verified computation. For exact derived figures, obtain and use actual permitted calculation/aggregation output. If required figures cannot be verified with available tools, disclose the missing verification instead of asserting completion.',
				'When finished, provide the final answer and its exact AGENT_STATUS comment from the completion instructions. Otherwise continue permitted tool work.',
			].join('\n'),
		};
	}
}
