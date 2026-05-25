// src/__tests__/presentation/chat-controller-message.test.ts
import { ChatController } from '../../presentation/components/chat/controllers/chat-controller';
import { ChatViewState } from '../../presentation/state/chat-view-state';

jest.mock('obsidian', () => ({
	Notice: jest.fn(),
	TFolder: class TFolder { path = ''; name = ''; },
	Events: class Events {
		on() {}
		off() {}
		trigger() {}
		offref() {}
	},
}));

jest.mock('../../i18n', () => ({ t: (key: string) => key }));

function makeChatService(overrides: Partial<{
	findLLMConfig: jest.Mock;
	buildReferenceContext: jest.Mock;
	prepareLlmMessages: jest.Mock;
	streamResponse: jest.Mock;
	executeAgentLoop: jest.Mock;
}> = {}) {
	return {
		findLLMConfig: jest.fn().mockReturnValue({ provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' }),
		buildReferenceContext: jest.fn().mockResolvedValue({ llmContent: 'hello', references: [] }),
		prepareLlmMessages: jest.fn().mockReturnValue([]),
		streamResponse: jest.fn().mockResolvedValue(undefined),
		executeAgentLoop: jest.fn().mockResolvedValue(undefined),
		...overrides,
	} as any;
}

function makePlugin(overrides: Partial<{ settings: Partial<{ llmConfigs: unknown[]; defaultModel: string; activeAgentId: string | null; agents: unknown[]; activeSystemPromptId: string | null; systemPrompts: unknown[] }> }> = {}) {
	return {
		settings: {
			llmConfigs: [{ id: 'p1', provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' }],
			defaultModel: 'gpt-4o',
			activeAgentId: null,
			agents: [],
			activeSystemPromptId: null,
			systemPrompts: [],
			ragConfig: { enabled: false },
			...overrides.settings,
		},
		saveSettings: jest.fn().mockResolvedValue(undefined),
	} as any;
}

function makeConversationManager() {
	return { saveCurrentConversation: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeRagStatusPanel() {
	return { displaySources: jest.fn() } as any;
}

function makeOptions(chatService: any, overrides: Partial<ReturnType<typeof makeDefaultOptions>> = {}) {
	return { ...makeDefaultOptions(chatService), ...overrides };
}

function makeDefaultOptions(chatService: any) {
	return {
		messagesContainer: document.createElement('div'),
		chatContainer: document.createElement('div'),
		messageController: { renderMessage: jest.fn().mockReturnValue(document.createElement('div')) } as any,
		agentController: {} as any,
		chatService,
		conversationManager: makeConversationManager(),
		ragStatusPanel: makeRagStatusPanel(),
		getSelectedModel: () => 'gpt-4o',
		clearInputUI: jest.fn(),
		addMessageToUI: jest.fn().mockReturnValue(document.createElement('div')),
		updateTokenSummary: jest.fn(),
		findMessageContentElement: () => document.createElement('div'),
		findMessageBodyElement: () => document.createElement('div'),
		onStreamingStateChange: jest.fn(),
	};
}

describe('ChatController (upgraded message pipeline)', () => {
	let state: ChatViewState;
	let controller: ChatController;

	beforeEach(() => {
		state = new ChatViewState();
		const plugin = makePlugin();
		controller = new ChatController({} as any, plugin, state);
		controller.configure(makeDefaultOptions(makeChatService()));
	});

	it('returns early without calling chatService when state.isStreaming is true', async () => {
		state.isStreaming = true;
		const chatService = makeChatService();
		controller.configure(makeOptions(chatService));
		await controller.sendMessage('hello');
		expect(chatService.streamResponse).not.toHaveBeenCalled();
	});

	it('returns early when llmConfigs is empty', async () => {
		const plugin = makePlugin({ settings: { llmConfigs: [] } });
		const localController = new ChatController({} as any, plugin, state);
		const chatService = makeChatService();
		localController.configure(makeOptions(chatService, { getSelectedModel: () => '' }));
		await localController.sendMessage('hello');
		expect(chatService.streamResponse).not.toHaveBeenCalled();
	});

	it('adds user message to state and calls streamResponse in chat mode', async () => {
		const chatService = makeChatService();
		controller.configure(makeOptions(chatService));
		await controller.sendMessage('hello world');
		expect(state.messages.some(m => m.role === 'user' && m.content === 'hello world')).toBe(true);
		expect(chatService.streamResponse).toHaveBeenCalledTimes(1);
	});

	it('calls executeAgentLoop in agent mode', async () => {
		state.mode = 'agent';
		const chatService = makeChatService();
		controller.configure(makeOptions(chatService));
		await controller.sendMessage('what can you do?');
		expect(chatService.executeAgentLoop).toHaveBeenCalledTimes(1);
		expect(chatService.streamResponse).not.toHaveBeenCalled();
	});
});
