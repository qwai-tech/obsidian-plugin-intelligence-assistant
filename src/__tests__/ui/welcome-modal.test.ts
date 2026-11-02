import { App } from 'obsidian';
import { WelcomeModal } from '@/ui/modals/welcome-modal';
import { initI18n } from '@/i18n';

describe('WelcomeModal', () => {
	beforeAll(() => initI18n('en'));

	function open() {
		const actions = { openSettings: jest.fn(), openChat: jest.fn(async () => undefined) };
		const modal = new WelcomeModal(new App() as never, actions);
		modal.onOpen();
		return { modal, actions };
	}

	const button = (modal: WelcomeModal, text: string) => Array.from(modal.contentEl.querySelectorAll('button')).find(candidate => candidate.textContent === text)!;

	it('walks a new user through the steps to a first conversation', () => {
		const { modal } = open();

		expect(modal.titleEl.textContent).toBe('Welcome to Intelligence Assistant');
		expect(Array.from(modal.contentEl.querySelectorAll('ol > li')).map(step => step.textContent)).toEqual([
			'Add a model provider, such as OpenAI or Ollama, in the LLM tab of the plugin settings.',
			'Test the connection and choose a default model.',
			'Open the chat and send your first message.',
		]);
	});

	it('opens the plugin settings from the first step', () => {
		const { modal, actions } = open();

		button(modal, 'Open settings').click();

		expect(actions.openSettings).toHaveBeenCalled();
	});

	it('opens the chat', () => {
		const { modal, actions } = open();

		button(modal, 'Open chat').click();

		expect(actions.openChat).toHaveBeenCalled();
	});
});
