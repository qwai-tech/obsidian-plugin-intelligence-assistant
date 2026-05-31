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

function makePlugin(overrides: Partial<{ settings: Partial<{ llmConfigs: unknown[]; defaultModel: string; activeAgentId: string | null; agents: unknown[]; activeSystemPromptId: string | null; systemPrompts: unknown[]; ragConfig: unknown; webSearchConfig: unknown }> }> = {}) {
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

	it('keeps the visible user message while sending an internal agent prompt override', async () => {
		state.mode = 'agent';
		const chatService = makeChatService();
		controller.configure(makeOptions(chatService));

		await controller.sendMessage('Create research brief: synthesis', {
			llmContentOverride: 'internal agent instructions',
		});

		expect(state.messages.some(m => m.role === 'user' && m.content === 'Create research brief: synthesis')).toBe(true);
		expect(chatService.prepareLlmMessages).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({ content: 'Create research brief: synthesis' }),
			'internal agent instructions',
			expect.any(Number),
		);
	});

	it('passes active agent RAG and web search settings into executeAgentLoop', async () => {
		state.mode = 'agent';
		const plugin = makePlugin({
			settings: {
				activeAgentId: 'agent-1',
				agents: [{
					id: 'agent-1',
					name: 'Agent One',
					ragEnabled: true,
					webSearchEnabled: true,
					contextWindow: 20,
					modelStrategy: { strategy: 'default' },
				}],
				ragConfig: { enabled: true } as any,
				webSearchConfig: { enabled: true } as any,
			} as any,
		});
		const localController = new ChatController({} as any, plugin, state);
		const chatService = makeChatService();
		localController.configure(makeOptions(chatService));

		await localController.sendMessage('use my vault context');

		expect(chatService.executeAgentLoop).toHaveBeenCalledTimes(1);
		const options = chatService.executeAgentLoop.mock.calls[0][1];
		expect(options.enableRAG).toBe(true);
		expect(options.enableWebSearch).toBe(true);
	});

	it('ignores manual RAG and web search state in agent mode', async () => {
		state.mode = 'agent';
		state.enableRAG = true;
		state.enableWebSearch = true;
		const plugin = makePlugin({
			settings: {
				activeAgentId: 'agent-1',
				agents: [{
					id: 'agent-1',
					name: 'Agent One',
					ragEnabled: false,
					webSearchEnabled: false,
					contextWindow: 20,
					modelStrategy: { strategy: 'default' },
				}],
				ragConfig: { enabled: true } as any,
				webSearchConfig: { enabled: true } as any,
			} as any,
		});
		const localController = new ChatController({} as any, plugin, state);
		const chatService = makeChatService();
		localController.configure(makeOptions(chatService));

		await localController.sendMessage('manual toggles should not control the agent');

		expect(chatService.executeAgentLoop).toHaveBeenCalledTimes(1);
		const options = chatService.executeAgentLoop.mock.calls[0][1];
		expect(options.enableRAG).toBe(false);
		expect(options.enableWebSearch).toBe(false);
	});

	it('re-renders completed agent messages with execution steps for write proposal cards', async () => {
		state.mode = 'agent';
		const proposal = {
			type: 'write_proposal',
			operation: 'create',
			path: 'Research/Research brief.md',
			content: 'brief',
			proposedContent: 'brief',
			applied: false,
			reason: 'review first',
		};
		const chatService = makeChatService({
			executeAgentLoop: jest.fn(async (_messages, _options, callbacks) => {
				callbacks.onToolCall('create_note', { title: 'Research brief' }, undefined, 'act');
				callbacks.onToolResult('create_note', true, JSON.stringify(proposal), 'act');
				callbacks.onComplete({ role: 'assistant', content: 'Prepared a research brief proposal.' });
				await Promise.resolve();
			}),
		});
		const chatContainer = document.createElement('div');
		document.body.appendChild(chatContainer);
		const addMessageToUI = jest.fn((message) => {
			const el = document.createElement('div');
			chatContainer.appendChild(el);
			return el;
		});
		controller.configure(makeOptions(chatService, { chatContainer, addMessageToUI }));

		await controller.sendMessage('Create research brief');
		await Promise.resolve();
		await Promise.resolve();

		const assistantMessages = addMessageToUI.mock.calls
			.map(call => call[0])
			.filter(message => message.role === 'assistant');
		expect(assistantMessages[assistantMessages.length - 1]).toEqual(expect.objectContaining({
			content: 'Prepared a research brief proposal.',
			agentExecutionSteps: expect.arrayContaining([
				expect.objectContaining({
					toolName: 'create_note',
					result: JSON.stringify(proposal),
					status: 'success',
				}),
			]),
		}));
		expect(state.messages[state.messages.length - 1]).toEqual(expect.objectContaining({
			content: 'Prepared a research brief proposal.',
			agentExecutionSteps: expect.any(Array),
		}));
		chatContainer.remove();
	});
});
