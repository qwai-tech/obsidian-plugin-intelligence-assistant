import { ChatInputComponent } from '../chat-input.component';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { initI18n } from '@/i18n';
import { TestIds } from '@/presentation/utils/test-ids';

function makePlugin() {
	return {
		settings: {
			defaultModel: 'openai:gpt-4o',
			ragConfig: { enabled: true },
			webSearchConfig: { enabled: true },
			activeAgentId: 'agent-1',
			agents: [{
				id: 'agent-1',
				name: 'Agent One',
				icon: 'A',
			}],
		},
	} as any;
}

function makeCallbacks() {
	return {
		onSendMessage: jest.fn().mockResolvedValue(undefined),
		onAttachImage: jest.fn().mockResolvedValue(undefined),
		onToggleRag: jest.fn().mockResolvedValue(undefined),
		onToggleWeb: jest.fn().mockResolvedValue(undefined),
		onShowReferenceMenu: jest.fn(),
		onStopStreaming: jest.fn(),
		onModeChange: jest.fn().mockResolvedValue(undefined),
		onModelChange: jest.fn().mockResolvedValue(undefined),
		onAgentChange: jest.fn().mockResolvedValue(undefined),
	};
}

describe('ChatInputComponent', () => {
	beforeEach(() => {
		initI18n('en');
		document.body.empty();
	});

	it('shows manual RAG and web search toggles in chat mode', () => {
		const parent = document.body.createDiv();
		const state = new ChatViewState();
		state.mode = 'chat';

		new ChatInputComponent(parent, {} as any, makePlugin(), state, makeCallbacks());

		const ragToggle = parent.querySelector(`[data-testid="${TestIds.chat.ragToggleBtn}"]`) as HTMLElement;
		const webToggle = parent.querySelector(`[data-testid="${TestIds.chat.webSearchToggleBtn}"]`) as HTMLElement;

		expect(ragToggle).not.toBeNull();
		expect(webToggle).not.toBeNull();
		expect(ragToggle.classList.contains('ia-hidden')).toBe(false);
		expect(webToggle.classList.contains('ia-hidden')).toBe(false);
	});

	it('hides manual RAG and web search toggles in agent mode', () => {
		const parent = document.body.createDiv();
		const state = new ChatViewState();
		state.mode = 'agent';
		state.enableRAG = true;
		state.enableWebSearch = true;

		const component = new ChatInputComponent(parent, {} as any, makePlugin(), state, makeCallbacks());
		component.updateActionToggleState(component.ragActionItem!, true, true, 'on');
		component.updateActionToggleState(component.webActionItem!, true, true, 'on');

		const ragToggle = parent.querySelector(`[data-testid="${TestIds.chat.ragToggleBtn}"]`) as HTMLElement;
		const webToggle = parent.querySelector(`[data-testid="${TestIds.chat.webSearchToggleBtn}"]`) as HTMLElement;

		expect(ragToggle).not.toBeNull();
		expect(webToggle).not.toBeNull();
		expect(ragToggle.classList.contains('ia-hidden')).toBe(true);
		expect(webToggle.classList.contains('ia-hidden')).toBe(true);
	});
});
