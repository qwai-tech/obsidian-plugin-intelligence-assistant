import { AgentEngineLoop } from '@/application/agents/agent-engine-loop';
import { HistoryCompactor } from '@/application/agents/history-compactor';
import type { StreamChunk } from '@/types/common/llm';

const writeTools = () => ({
	resolveForAgent: jest.fn(() => [{ llmName: 'create_note', toolId: 'builtin:builtin:create_note', definition: { description: 'Create a note' } }]),
	toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'create_note', description: 'Create a note', parameters: { type: 'object', properties: {} } } }]),
	executeTool: jest.fn(),
});

const run = async (userMessage: string) => {
	const provider = {
		streamChat: jest.fn(async (_request: unknown, onChunk: (chunk: StreamChunk) => void) => {
			onChunk({ content: 'Here is the summary.', done: false });
		}),
	};
	const onThought = jest.fn();
	const onComplete = jest.fn();
	await new AgentEngineLoop({
		toolRegistry: writeTools() as never,
		senseService: { sense: jest.fn(async () => ({ userQuery: userMessage, activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })), formatSenseContext: jest.fn(() => 'sense') } as never,
		historyCompactor: new HistoryCompactor(),
		webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as never,
		createProvider: () => ({ provider: provider as never, providerId: 'openai' }),
	}).execute([{ role: 'user', content: userMessage }], { model: 'gpt-4o', mode: 'agent' }, {
		onChunk: jest.fn(), onToolCall: jest.fn(), onToolResult: jest.fn(), onThought, onComplete, onError: jest.fn(),
	});
	return { provider, onThought, onComplete };
};

describe('write-proposal guard', () => {
	it('does not force a write for a read-only task, even though the agent instructions mention write proposals', async () => {
		const { provider, onComplete } = await run('Summarize my reading list.');

		expect(provider.streamChat).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ content: 'Here is the summary.' }));
	});

	it('forces one write attempt when the task asks for a write proposal', async () => {
		const { provider, onThought } = await run('Draft it and create a write proposal for review.');

		expect(provider.streamChat).toHaveBeenCalledTimes(2);
		expect((provider.streamChat.mock.calls[1][0] as { toolChoice: unknown }).toolChoice).toEqual({ type: 'function', function: { name: 'create_note' } });
		expect(onThought).toHaveBeenCalledWith(expect.stringContaining('required write proposal'), 'reflect');
	});
});
