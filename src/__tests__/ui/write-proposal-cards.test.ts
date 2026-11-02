import { renderWriteProposalCards } from '@/ui/chat/write-proposal-cards';
import { initI18n } from '@/i18n';
import type { AgentExecutionStep } from '@/features/llm/types/reasoning';

const proposal = { type: 'write_proposal', operation: 'create', path: 'Research/brief.md', content: 'brief', proposedContent: 'brief', applied: false, reason: 'review first' };
const step = (overrides: Partial<AgentExecutionStep> = {}): AgentExecutionStep => ({ type: 'action', content: '', timestamp: 1, toolName: 'create_note', result: JSON.stringify(proposal), ...overrides });
const applyButton = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('.ia-write-proposal-card__actions button')!;

describe('write proposal cards', () => {
	beforeAll(() => initI18n('en'));

	it('shows a proposal applied in an earlier session as applied', () => {
		const container = document.createElement('div');

		renderWriteProposalCards(container, [step({ proposalApplied: true })], jest.fn());

		expect(applyButton(container).textContent).toBe('Applied');
		expect(applyButton(container).disabled).toBe(true);
	});

	it('applies a proposal together with the step that holds it', async () => {
		const container = document.createElement('div');
		const held = step();
		const apply = jest.fn(async () => true);
		renderWriteProposalCards(container, [held], apply);

		applyButton(container).click();
		await Promise.resolve();
		await Promise.resolve();

		expect(apply).toHaveBeenCalledWith(expect.objectContaining({ path: 'Research/brief.md' }), held);
		expect(applyButton(container).textContent).toBe('Applied');
	});
});
