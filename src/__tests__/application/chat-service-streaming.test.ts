import { ChatService } from '@/application/services/chat.service';
import type { StreamChunk } from '@/types/common/llm';

const provider = {
	streamChat: jest.fn(),
	chat: jest.fn(),
};

jest.mock('@qwai/obsidian-llm', () => ({
	ModelManager: { findConfigForModelByProvider: jest.fn(() => ({ provider: 'openai' })) },
	ProviderFactory: { createProvider: jest.fn(() => provider) },
}));

const chatService = () => new ChatService({
	fileSystem: {} as never,
	knowledge: {} as never,
	webSearchService: {} as never,
	settings: () => ({ llmConfigs: [], defaultModel: 'gpt-4o' }),
});

const callbacks = (signal?: AbortSignal) => ({
	onChunk: jest.fn(),
	onComplete: jest.fn(),
	onError: jest.fn(),
	signal,
});

describe('ChatService streaming cancellation', () => {
	beforeEach(() => provider.streamChat.mockReset());

	it('hands the run signal to the provider request', async () => {
		provider.streamChat.mockImplementation(async (_request: unknown, onChunk: (chunk: StreamChunk) => void) => {
			onChunk({ content: '', done: true });
		});
		const controller = new AbortController();

		await chatService().streamResponse([{ role: 'user', content: 'hi' }], { model: 'gpt-4o', mode: 'chat' }, callbacks(controller.signal));

		expect(provider.streamChat.mock.calls[0][0]).toMatchObject({ signal: controller.signal });
	});

	it('completes with the text received before the user stopped', async () => {
		const controller = new AbortController();
		provider.streamChat.mockImplementation(async (_request: unknown, onChunk: (chunk: StreamChunk) => void) => {
			onChunk({ content: 'partial ', done: false });
			controller.abort();
			onChunk({ content: '', done: true });
		});
		const ui = callbacks(controller.signal);

		await chatService().streamResponse([{ role: 'user', content: 'hi' }], { model: 'gpt-4o', mode: 'chat' }, ui);

		expect(ui.onError).not.toHaveBeenCalled();
		expect(ui.onComplete).toHaveBeenCalledWith(expect.objectContaining({ content: 'partial ' }));
	});

	it('treats a transport abort error as a stop, not a failure', async () => {
		const controller = new AbortController();
		provider.streamChat.mockImplementation(async (_request: unknown, onChunk: (chunk: StreamChunk) => void) => {
			onChunk({ content: 'so far', done: false });
			controller.abort();
			throw new Error('Request was aborted');
		});
		const ui = callbacks(controller.signal);

		await chatService().streamResponse([{ role: 'user', content: 'hi' }], { model: 'gpt-4o', mode: 'chat' }, ui);

		expect(ui.onError).not.toHaveBeenCalled();
		expect(ui.onComplete).toHaveBeenCalledWith(expect.objectContaining({ content: 'so far' }));
	});
});

describe('ChatService agent delegation', () => {
	it('delegates executeAgentLoop to AgentEngineLoop when one is configured', async () => {
		const loop = { execute: jest.fn(async () => undefined) };
		const service = new ChatService({
			fileSystem: {} as any,
			knowledge: {} as any,
			webSearchService: {} as any,
			settings: () => ({ llmConfigs: [], defaultModel: 'gpt-4o' }),
			agentEngineLoop: loop as any,
		});
		const callbacks = {
			onChunk: jest.fn(),
			onToolCall: jest.fn(),
			onToolResult: jest.fn(),
			onThought: jest.fn(),
			onComplete: jest.fn(),
			onError: jest.fn(),
		};

		await service.executeAgentLoop(
			[{ role: 'user', content: 'hello' }],
			{ model: 'gpt-4o', mode: 'agent', references: [{ type: 'file', path: 'A.md', name: 'A.md' }] } as any,
			callbacks,
		);

		expect(loop.execute).toHaveBeenCalledWith(
			[{ role: 'user', content: 'hello' }],
			expect.objectContaining({ references: [{ type: 'file', path: 'A.md', name: 'A.md' }] }),
			callbacks,
		);
	});
});
