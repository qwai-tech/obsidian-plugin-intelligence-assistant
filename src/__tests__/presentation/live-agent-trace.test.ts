import 'obsidian';
import { ChatController } from '@/presentation/components/chat/controllers/chat-controller';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import type { AgentLoopCallbacks } from '@/application/agents/types';

jest.mock('@/i18n', () => ({ t: (key: string) => key }));

describe('live agent trace', () => {
	it('shows each tool call and its result while the run is still going', async () => {
		const state = new ChatViewState();
		state.mode = 'agent';
		const body = document.createElement('div');
		const content = body.createDiv();
		let duringRun = '';
		let afterResult = '';
		const chatService = {
			findLLMConfig: jest.fn(() => ({ provider: 'openai' })),
			buildReferenceContext: jest.fn(async () => ({ llmContent: 'go', references: [] })),
			prepareLlmMessages: jest.fn(() => []),
			executeAgentLoop: jest.fn(async (_m: unknown, _o: unknown, callbacks: AgentLoopCallbacks) => {
				callbacks.onToolCall('read_file', { path: 'a.md' }, undefined, 'act');
				duringRun = body.textContent ?? '';
				callbacks.onToolResult('read_file', true, '"contents"', 'act');
				afterResult = body.innerHTML;
			}),
		};
		const plugin = { settings: { llmConfigs: [{ provider: 'openai' }], activeAgentId: null, agents: [], systemPrompts: [], ragConfig: { enabled: false }, webSearchConfig: { enabled: false } } };
		const controller = new ChatController({} as never, plugin as never, state);
		controller.configure({
			chatContainer: document.createElement('div'),
			chatService: chatService as never,
			conversationManager: { saveCurrentConversation: jest.fn() } as never,
			ragStatusPanel: {} as never,
			getSelectedModel: () => 'gpt-4o',
			clearInputUI: jest.fn(),
			addMessageToUI: jest.fn(() => document.createElement('div')),
			updateTokenSummary: jest.fn(),
			findMessageContentElement: () => content,
			findMessageBodyElement: () => body,
			onStreamingStateChange: jest.fn(),
		});

		await controller.sendMessage('read a.md');

		expect(duringRun).toContain('read_file');
		expect(afterResult).toContain('is-success');
		expect(body.firstElementChild).not.toBe(content);
	});
});
