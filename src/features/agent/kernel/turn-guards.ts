import type { GuardVerdict, ModelTurn, RunView, TurnGuard } from './turn-kernel';

const WRITE_TOOL_PRIORITY = ['create_note', 'write_file', 'append_to_note'];

/** Only an explicit host task contract may force a write tool; quoted prose cannot. */
export function requiresWriteProposal(explicit: boolean | undefined, _prompts: string[]): boolean {
	return explicit === true;
}

export function selectWriteTool(toolNames: string[]): string | null {
	for (const preferred of WRITE_TOOL_PRIORITY) {
		const match = toolNames.find((name) => name === preferred || name.startsWith(`${preferred}_`));
		if (match) return match;
	}
	return null;
}

const MAX_EMPTY_RETRIES = 2;
const MAX_PROPOSAL_RETRIES = 1;

const EMPTY_RESPONSE_CORRECTION =
	'Your previous response was empty. This usually means the output token limit truncated a large tool call, or you returned no tool call. Continue the task now by calling the next required tool. If a single item is too large to write in one tool call, write shorter content or split it across several tool calls.';

export const EMPTY_RESPONSE_FINAL_MESSAGE =
	'The model repeatedly returned empty responses, likely because the output token limit truncated a large tool call. Try increasing the agent\'s Max Tokens, or split the work into smaller steps with shorter content per tool call.';

const PROPOSAL_CORRECTION = [
	'You ended the previous turn without creating the required write proposal.',
	'Call create_note or write_file now with the complete proposed artifact content.',
	'Do not only describe what you will do. The UI needs the tool result to render an Apply-able write proposal card.',
].join('\n');

export class EmptyTurnGuard implements TurnGuard {
	readonly name = 'emptyTurn';
	private retries = 0;

	check(turn: ModelTurn): GuardVerdict {
		if (turn.text.trim() !== '') {
			return { kind: 'pass' };
		}
		if (this.retries >= MAX_EMPTY_RETRIES) {
			return { kind: 'answer', answer: EMPTY_RESPONSE_FINAL_MESSAGE };
		}
		this.retries++;
		return {
			kind: 'retry',
			message: 'Model returned an empty response (likely a truncated tool call or empty output); retrying with guidance.',
			correction: EMPTY_RESPONSE_CORRECTION,
			placeholder: '(empty response)',
		};
	}
}

export class MissingProposalGuard implements TurnGuard {
	readonly name = 'missingProposal';
	private retries = 0;

	constructor(private readonly options: { required: boolean; writeTool: string | null }) {}

	check(_turn: ModelTurn, run: Pick<RunView, 'proposalsCreated'>): GuardVerdict {
		const { required, writeTool } = this.options;
		if (!required || !writeTool || run.proposalsCreated > 0 || this.retries >= MAX_PROPOSAL_RETRIES) {
			return { kind: 'pass' };
		}
		this.retries++;
		return {
			kind: 'retry',
			message: 'Model ended before creating the required write proposal; retrying with a forced write-proposal tool call.',
			correction: PROPOSAL_CORRECTION,
			placeholder: 'I did not create the required write proposal yet.',
			forceTool: writeTool,
		};
	}
}
