import { AutonomousAgentLoop, HistoryCompactor } from '@/application/agents';
import type { Message } from '@/types';

describe('AutonomousAgentLoop', () => {
	it('injects sense context and completes when no tools are requested', async () => {
		const provider = {
			streamChat: jest.fn(async (_request, onChunk) => {
				onChunk({ content: 'final answer' });
				onChunk({ usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 } });
			}),
		};
		const senseService = {
			sense: jest.fn(async () => ({
				userQuery: 'summarize',
				activeFilePath: 'A.md',
				references: [],
				sections: [{ title: 'Active note', content: 'note content', source: 'active-note' }],
				ragSources: [],
				memory: null,
			})),
			formatSenseContext: jest.fn(() => '## Vault-Aware Sense Context\nnote content'),
		};
		const registry = {
			resolveForAgent: jest.fn(() => []),
			toOpenAIFunctions: jest.fn(() => []),
			executeTool: jest.fn(),
		};
		const loop = new AutonomousAgentLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		const completed: Message[] = [];
		await loop.execute(
			[{ role: 'user', content: 'summarize' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: [] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult: jest.fn(),
				onThought: jest.fn(),
				onComplete: message => completed.push(message),
				onError: error => { throw error; },
			},
		);

		expect(senseService.sense).toHaveBeenCalled();
		expect(provider.streamChat.mock.calls[0][0].messages[0].content).toContain('Vault-Aware Sense Context');
		expect(completed[0].content).toBe('final answer');
	});

	it('executes a native tool call and appends a tool result message', async () => {
		const provider = {
			streamChat: jest.fn()
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({
						toolCalls: [{
							id: 'call-1',
							function: { name: 'read_file', arguments: JSON.stringify({ path: 'A.md' }) },
						}],
					});
				})
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({ content: 'I read A.md' });
				}),
		};
		const registry = {
			resolveForAgent: jest.fn(() => [{ llmName: 'read_file', toolId: 'builtin:builtin:read_file', definition: { description: 'Read file' } }]),
			toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } } }]),
			executeTool: jest.fn(async () => ({ success: true, result: 'file contents' })),
		};
		const senseService = {
			sense: jest.fn(async () => ({ userQuery: 'read', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
			formatSenseContext: jest.fn(() => 'sense context'),
		};
		const onToolResult = jest.fn();
		const loop = new AutonomousAgentLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute(
			[{ role: 'user', content: 'read A.md' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: [{ id: 'agent-1', maxSteps: 3, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult,
				onThought: jest.fn(),
				onComplete: jest.fn(),
				onError: error => { throw error; },
			},
		);

		expect(registry.executeTool).toHaveBeenCalledWith('read_file', { path: 'A.md' });
		expect(onToolResult).toHaveBeenCalledWith('read_file', true, JSON.stringify('file contents'), 'act');
		expect(provider.streamChat).toHaveBeenCalledTimes(2);
	});
});
