import { renderMessage } from '../message-renderer';
import type { Message } from '@/types';
import type { WriteProposal } from '@/application/services/write-proposal-service';

const mockContext = {
	app: {} as any,
	plugin: {
		settings: { llmConfigs: [] },
	} as any,
	mode: 'agent' as const,
	messages: [],
};

describe('renderMessage write proposals', () => {
	beforeAll(() => {
		HTMLElement.prototype.setCssProps = function(props: Record<string, string>) {
			Object.entries(props).forEach(([key, value]) => this.style.setProperty(key, value));
		};
	});

	it('renders write proposal review cards with apply buttons', () => {
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
		const message: Message = {
			role: 'assistant',
			content: 'I prepared a proposal.',
			agentExecutionSteps: [
				{
					type: 'action',
					content: 'write_file({})',
					timestamp: Date.now(),
					status: 'success',
					result: JSON.stringify(proposal),
				},
			],
		};
		const applyWriteProposal = jest.fn().mockResolvedValue(undefined);
		const container = document.createElement('div');

		const messageEl = renderMessage(container, message, mockContext, { applyWriteProposal });

		const card = messageEl.querySelector('.ia-write-proposal-card');
		expect(card).toBeTruthy();
		expect(card?.textContent).toContain('Notes/A.md');
		expect(card?.textContent).toContain('update');
		const button = card?.querySelector('button');
		expect(button?.textContent).toContain('Apply');
	});

	it('calls apply callback when the apply button is clicked', async () => {
		const proposal: WriteProposal = {
			type: 'write_proposal',
			operation: 'create',
			path: 'Inbox/New.md',
			content: 'draft',
			proposedContent: 'draft',
			applied: false,
			reason: 'review first',
		};
		const message: Message = {
			role: 'assistant',
			content: 'I prepared a proposal.',
			agentExecutionSteps: [
				{
					type: 'action',
					content: 'create_note({})',
					timestamp: Date.now(),
					status: 'success',
					result: JSON.stringify(proposal),
				},
			],
		};
		const applyWriteProposal = jest.fn().mockResolvedValue(undefined);
		const container = document.createElement('div');

		const messageEl = renderMessage(container, message, mockContext, { applyWriteProposal });
		const button = messageEl.querySelector<HTMLButtonElement>('.ia-write-proposal-card button');
		button?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(applyWriteProposal).toHaveBeenCalledWith(proposal);
	});
});
