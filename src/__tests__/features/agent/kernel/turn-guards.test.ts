import { EmptyTurnGuard, MissingProposalGuard, EMPTY_RESPONSE_FINAL_MESSAGE } from '@/features/agent/kernel/turn-guards';
import type { ModelTurn } from '@/features/agent/kernel/turn-kernel';

const turn = (text: string): ModelTurn => ({ text, reasoning: '', calls: [] });

describe('EmptyTurnGuard', () => {
	it('retries an empty turn twice, then answers with an explanation', () => {
		const guard = new EmptyTurnGuard();
		const view = { proposalsCreated: 0 };

		expect(guard.check(turn(''), view)).toMatchObject({ kind: 'retry', placeholder: '(empty response)' });
		expect(guard.check(turn('  '), view)).toMatchObject({ kind: 'retry' });
		expect(guard.check(turn(''), view)).toEqual({ kind: 'answer', answer: EMPTY_RESPONSE_FINAL_MESSAGE });
	});

	it('passes a turn with text', () => {
		expect(new EmptyTurnGuard().check(turn('done'), { proposalsCreated: 0 })).toEqual({ kind: 'pass' });
	});
});

describe('MissingProposalGuard', () => {
	it('retries once with the write tool forced when a required proposal is missing', () => {
		const guard = new MissingProposalGuard({ required: true, writeTool: 'create_note' });

		const first = guard.check(turn('I will create it.'), { proposalsCreated: 0 });
		const second = guard.check(turn('Still nothing.'), { proposalsCreated: 0 });

		expect(first).toMatchObject({ kind: 'retry', forceTool: 'create_note', placeholder: 'I did not create the required write proposal yet.' });
		expect(second).toEqual({ kind: 'pass' });
	});

	it('passes when a proposal exists, none is required, or no write tool is available', () => {
		expect(new MissingProposalGuard({ required: true, writeTool: 'create_note' }).check(turn(''), { proposalsCreated: 1 })).toEqual({ kind: 'pass' });
		expect(new MissingProposalGuard({ required: false, writeTool: 'create_note' }).check(turn(''), { proposalsCreated: 0 })).toEqual({ kind: 'pass' });
		expect(new MissingProposalGuard({ required: true, writeTool: null }).check(turn(''), { proposalsCreated: 0 })).toEqual({ kind: 'pass' });
	});
});
