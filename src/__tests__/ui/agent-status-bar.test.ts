import 'obsidian';
import { RunActivity } from '@/features/agent/run-activity';
import { AgentStatusBar } from '@/ui/status/agent-status-bar';
import { initI18n } from '@/i18n';

beforeAll(() => initI18n('en'));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AgentStatusBar', () => {
	const setup = (totalTokens: number) => {
		const el = document.createElement('div');
		const activity = new RunActivity();
		const usage = { getGrandTotal: jest.fn(async () => ({ totalTokens })) };
		const bar = new AgentStatusBar(el, activity, usage);
		return { el, activity, usage, bar };
	};

	it('shows idle state with cumulative tokens', async () => {
		const { el, bar } = setup(1500);

		bar.render();
		await flush();

		expect(el.textContent).toBe('IA: idle · 1.5k tokens');
	});

	it('repaints as running when a run begins', async () => {
		const { el, activity, bar } = setup(42);
		bar.render();

		activity.begin();
		await flush();

		expect(el.textContent).toBe('IA: running · 42 tokens');
	});

	it('shows zero tokens when usage cannot be read', async () => {
		const { el, usage, bar } = setup(0);
		usage.getGrandTotal.mockRejectedValueOnce(new Error('unreadable'));

		bar.render();
		await flush();

		expect(el.textContent).toBe('IA: idle · 0 tokens');
	});

	it('stops repainting after dispose', async () => {
		const { activity, usage, bar } = setup(1);
		bar.dispose();

		activity.begin();
		await flush();

		expect(usage.getGrandTotal).not.toHaveBeenCalled();
	});
});
