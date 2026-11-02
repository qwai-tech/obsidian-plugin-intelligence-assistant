import { TFile } from 'obsidian';
import {
	applyWriteProposal,
	assertWriteProposalResult,
	createWriteProposal,
	proposalCardsFromSteps,
	type WriteProposal,
} from '@/features/agent/write-proposal-service';
import type { AgentExecutionStep } from '@/features/llm/types/reasoning';

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').pop() ?? path;
	file.extension = 'md';
	return file;
}

describe('write proposal service', () => {
	it('extracts write proposals from agent action results', () => {
		const proposal: WriteProposal = {
			type: 'write_proposal',
			operation: 'update',
			path: 'Notes/A.md',
			content: 'new',
			previousContent: 'old',
			proposedContent: 'new',
			applied: false,
			reason: 'review first',
		};
		const steps: AgentExecutionStep[] = [
			{
				type: 'action',
				content: 'write_file({})',
				timestamp: Date.now(),
				status: 'success',
				result: JSON.stringify(proposal),
			},
		];

		expect(proposalCardsFromSteps(steps).map(card => card.proposal)).toEqual([proposal]);
	});

	it('applies a create proposal by creating a note', async () => {
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(null),
				create: jest.fn().mockResolvedValue(undefined),
				modify: jest.fn(),
			},
		};

		await applyWriteProposal(app as any, {
			type: 'write_proposal',
			operation: 'create',
			path: 'Inbox/New.md',
			content: 'draft',
			proposedContent: 'draft',
			applied: false,
			reason: 'review first',
		});

		expect(app.vault.create).toHaveBeenCalledWith('Inbox/New.md', 'draft');
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	const updateApp = (file: TFile, disk: string) => {
		const state = { disk };
		return {
			state,
			workspace: { getLeavesOfType: jest.fn(() => []) },
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(file),
				create: jest.fn(),
				modify: jest.fn(),
				process: jest.fn(async (_file: TFile, fn: (data: string) => string) => {
					state.disk = fn(state.disk);
					return state.disk;
				}),
			},
		};
	};

	const updateProposal = (previousContent: string | undefined): WriteProposal => ({
		type: 'write_proposal',
		operation: 'update',
		path: 'Notes/A.md',
		content: 'new',
		previousContent,
		proposedContent: 'new',
		applied: false,
		reason: 'review first',
	});

	it('applies an update proposal atomically to the note it was made from', async () => {
		const app = updateApp(makeFile('Notes/A.md'), 'old');

		await applyWriteProposal(app as any, updateProposal('old'));

		expect(app.state.disk).toBe('new');
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it('refuses an update when the note changed after the proposal was made', async () => {
		const app = updateApp(makeFile('Notes/A.md'), 'edited by the user');

		await expect(applyWriteProposal(app as any, updateProposal('old'))).rejects.toThrow('Notes/A.md changed after the proposal was made');

		expect(app.state.disk).toBe('edited by the user');
	});

	it('applies an update without a recorded previous content', async () => {
		const app = updateApp(makeFile('Notes/A.md'), 'anything');

		await applyWriteProposal(app as any, updateProposal(undefined));

		expect(app.state.disk).toBe('new');
	});

	it('accepts write proposal results', () => {
		const proposal = createWriteProposal({ operation: 'create', path: 'A.md', content: 'A' });
		expect(assertWriteProposalResult(proposal)).toEqual({ success: true });
	});

	it('rejects non proposal write results', () => {
		const result = assertWriteProposalResult('direct write complete');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain('must return a write proposal');
		}
	});
});
