import { TFile } from 'obsidian';
import {
	applyWriteProposal,
	assertWriteProposalResult,
	createWriteProposal,
	extractWriteProposalsFromSteps,
	type WriteProposal,
} from '../../application/services/write-proposal-service';
import type { AgentExecutionStep } from '../../types/common/reasoning';

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

		expect(extractWriteProposalsFromSteps(steps)).toEqual([proposal]);
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

	it('applies an update proposal by modifying an existing note', async () => {
		const file = makeFile('Notes/A.md');
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(file),
				create: jest.fn(),
				modify: jest.fn().mockResolvedValue(undefined),
			},
		};

		await applyWriteProposal(app as any, {
			type: 'write_proposal',
			operation: 'update',
			path: 'Notes/A.md',
			content: 'new',
			previousContent: 'old',
			proposedContent: 'new',
			applied: false,
			reason: 'review first',
		});

		expect(app.vault.modify).toHaveBeenCalledWith(file, 'new');
		expect(app.vault.create).not.toHaveBeenCalled();
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
