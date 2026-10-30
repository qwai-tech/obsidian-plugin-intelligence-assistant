import { renderMessage } from '../message-renderer';
import { describeProposal } from '../write-proposal-cards';
import type { Message } from '@/features/conversations/types/conversation';
import type { WriteProposal } from '@/features/agent/write-proposal-service';

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
		const applyWriteProposal = jest.fn().mockResolvedValue(true);
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
		const applyWriteProposal = jest.fn().mockResolvedValue(true);
		const container = document.createElement('div');

		const messageEl = renderMessage(container, message, mockContext, { applyWriteProposal });
		const button = messageEl.querySelector<HTMLButtonElement>('.ia-write-proposal-card button');
		button?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(applyWriteProposal).toHaveBeenCalledWith(proposal);
	});

	const proposalMessage = (): Message => ({
		role: 'assistant',
		content: 'I prepared a proposal.',
		agentExecutionSteps: [{
			type: 'action',
			content: 'create_note({})',
			timestamp: Date.now(),
			status: 'success',
			result: JSON.stringify({ type: 'write_proposal', operation: 'create', path: 'Inbox/New.md', proposedContent: 'draft', applied: false, reason: 'review' }),
		}],
	});

	const clickApply = async (applied: boolean) => {
		const applyWriteProposal = jest.fn().mockResolvedValue(applied);
		const messageEl = renderMessage(document.createElement('div'), proposalMessage(), mockContext, { applyWriteProposal });
		const button = messageEl.querySelector<HTMLButtonElement>('.ia-write-proposal-card button')!;
		button.click();
		await new Promise(resolve => setTimeout(resolve, 0));
		return button;
	};

	it('marks the card applied once the proposal is applied', async () => {
		const button = await clickApply(true);

		expect(button.textContent).toBe('Applied');
		expect(button.disabled).toBe(true);
	});

	it('keeps the card ready to apply when the user cancels', async () => {
		const button = await clickApply(false);

		expect(button.textContent).toBe('Apply');
		expect(button.disabled).toBe(false);
	});
});

describe('describeProposal', () => {
	it('describes single and batch proposals', () => {
		expect(describeProposal({ type: 'write_proposal', operation: 'update', path: 'A.md', applied: false, reason: '' })).toBe('update A.md');
		expect(describeProposal({ type: 'batch_proposal', id: 'b', reason: '', applied: false, proposals: [
			{ type: 'write_proposal', operation: 'create', path: 'B.md', applied: false, reason: '' },
			{ type: 'write_proposal', operation: 'delete', path: 'C.md', applied: false, reason: '' },
		] })).toBe('2 changes: create B.md, delete C.md');
	});
});
