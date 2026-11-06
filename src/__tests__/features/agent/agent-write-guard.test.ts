import { bindAgentRegistry, finalAgentReply } from '@/test-support/agent-fixtures';
import { AgentEngineLoop } from '@/features/agent/agent-engine-loop';
import { HistoryCompactor } from '@/features/agent/history-compactor';

const writeTools = () => ({
	resolveForAgent: jest.fn(() => [{ llmName: 'create_note', toolId: 'builtin:builtin:create_note', definition: { description: 'Create a note' } }]),
	toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'create_note', description: 'Create a note', parameters: { type: 'object', properties: {} } } }]),
	executeTool: jest.fn(),
});

const run = async (userMessage: string, expectsWriteProposal = false) => {
	const provider = {
		streamChat: jest.fn(finalAgentReply('Here is the summary.')),
	};
	const onThought = jest.fn();
	const onComplete = jest.fn();
	await new AgentEngineLoop({
		toolRegistry: bindAgentRegistry(writeTools()) as never,
		senseService: { sense: jest.fn(async () => ({ userQuery: userMessage, activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })), formatSenseContext: jest.fn(() => 'sense') } as never,
		historyCompactor: new HistoryCompactor(),
		webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as never,
		createProvider: () => ({ provider: provider as never, providerId: 'openai' }),
	}).execute([{ role: 'user', content: userMessage }], { model: 'gpt-4o', mode: 'agent', expectsWriteProposal }, {
		onChunk: jest.fn(), onToolCall: jest.fn(), onToolResult: jest.fn(), onThought, onComplete, onError: jest.fn(),
	});
	return { provider, onThought, onComplete };
};

describe('write-proposal guard', () => {
	it('does not force a write for a read-only task, even though the agent instructions mention write proposals', async () => {
		const { provider, onComplete } = await run('Summarize my reading list.');

		expect(provider.streamChat).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ content: 'Here is the summary.' }));
	});

	it('forces one write attempt for an explicit host write-proposal contract', async () => {
		const { provider, onThought } = await run('Draft it and create a write proposal for review.', true);

		expect(provider.streamChat).toHaveBeenCalledTimes(3);
		expect((provider.streamChat.mock.calls[1][0] as { toolChoice: unknown }).toolChoice).toEqual({ type: 'function', function: { name: 'create_note' } });
		expect(onThought).toHaveBeenCalledWith(expect.stringContaining('required write proposal'), 'reflect');
	});
});
