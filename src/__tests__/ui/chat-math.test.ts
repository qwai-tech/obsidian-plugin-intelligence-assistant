import { finishRenderMath } from 'obsidian';
import { renderMessage } from '@/ui/chat/message-renderer';
import { initI18n } from '@/i18n';

async function renderReply(content: string): Promise<HTMLElement> {
	const container = document.createElement('div');
	const context = { app: {} as never, plugin: { settings: { llmConfigs: [] } } as never, mode: 'chat' as const, messages: [] };
	const el = renderMessage(container, { role: 'assistant', content, model: 'm' }, context);
	await new Promise(resolve => setTimeout(resolve, 0));
	return el.querySelector<HTMLElement>('[data-message-content]')!;
}

const formulas = (root: HTMLElement) => Array.from(root.querySelectorAll('.math')).map(el => [el.getAttribute('data-tex'), el.getAttribute('data-display')]);

describe('math in chat replies', () => {
	beforeAll(() => initI18n('en'));

	it('typesets display and inline formulas, keeping underscores and asterisks inside them', async () => {
		const content = await renderReply('Energy:\n\n$$E = mc^2$$\n\nwhere $a_1 * b_2$ and $x_i$ matter.');

		expect(formulas(content)).toEqual([['E = mc^2', 'true'], ['a_1 * b_2', 'false'], ['x_i', 'false']]);
		expect(finishRenderMath).toHaveBeenCalled();
	});

	it('leaves prices and code alone', async () => {
		const content = await renderReply('It costs $5 and $10 today. `$x$` stays code.\n\n```\n$$not math$$\n```');

		expect(formulas(content)).toEqual([]);
		expect(content.textContent).toContain('$5 and $10');
		expect(content.textContent).toContain('$$not math$$');
	});
});
