import { AgentEngineLoop, HistoryCompactor, ObsidianAgentRunStateStore } from '@/application/agents';
import { InMemoryStateStore } from '@/application/agents/kernel/agent-engine-core';
import type { Message } from '@/types';

const createAgentRunStateStore = () => new InMemoryStateStore();

class MemoryAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();

	exists = jest.fn(async (path: string) => this.files.has(path) || this.folders.has(path));
	mkdir = jest.fn(async (path: string) => {
		this.folders.add(path);
	});
	write = jest.fn(async (path: string, content: string) => {
		this.files.set(path, content);
	});
	read = jest.fn(async (path: string) => {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	});
}

describe('AgentEngineLoop', () => {
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
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: createAgentRunStateStore(),
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
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: createAgentRunStateStore(),
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
		const secondRequestMessages = provider.streamChat.mock.calls[1][0].messages as any[];
		expect(secondRequestMessages.some(message => message.role === 'assistant' && message.tool_calls?.[0]?.id === 'call-1')).toBe(true);
		expect(secondRequestMessages.some(message => message.role === 'tool' && message.tool_call_id === 'call-1')).toBe(true);
	});

	it('buffers multiple tool calls from one model turn before the next provider request', async () => {
		const provider = {
			streamChat: jest.fn()
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({
						toolCalls: [
							{
								id: 'call-1',
								function: { name: 'read_file', arguments: JSON.stringify({ path: 'A.md' }) },
							},
							{
								id: 'call-2',
								function: { name: 'search_notes', arguments: JSON.stringify({ query: 'kernel' }) },
							},
						],
					});
				})
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({ content: 'I used both tools' });
				}),
		};
		const registry = {
			resolveForAgent: jest.fn(() => [
				{ llmName: 'read_file', toolId: 'builtin:builtin:read_file', definition: { description: 'Read file' } },
				{ llmName: 'search_notes', toolId: 'builtin:builtin:search_notes', definition: { description: 'Search notes' } },
			]),
			toOpenAIFunctions: jest.fn(() => [
				{ type: 'function', function: { name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } } },
				{ type: 'function', function: { name: 'search_notes', description: 'Search notes', parameters: { type: 'object', properties: {} } } },
			]),
			executeTool: jest.fn(async (name: string) => ({
				success: true,
				result: name === 'read_file' ? 'file contents' : ['Kernel note'],
			})),
		};
		const senseService = {
			sense: jest.fn(async () => ({ userQuery: 'read and search', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
			formatSenseContext: jest.fn(() => 'sense context'),
		};
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: createAgentRunStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute(
			[{ role: 'user', content: 'read and search' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: [{ id: 'agent-1', maxSteps: 4, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult: jest.fn(),
				onThought: jest.fn(),
				onComplete: jest.fn(),
				onError: error => { throw error; },
			},
		);

		expect(registry.executeTool).toHaveBeenCalledTimes(2);
		expect(provider.streamChat).toHaveBeenCalledTimes(2);
		const secondRequestMessages = provider.streamChat.mock.calls[1][0].messages as any[];
		const assistantWithCalls = secondRequestMessages.find(message => message.role === 'assistant' && message.tool_calls?.length === 2);
		expect(assistantWithCalls?.tool_calls.map((call: any) => call.id)).toEqual(['call-1', 'call-2']);
		expect(secondRequestMessages.some(message => message.role === 'tool' && message.tool_call_id === 'call-1')).toBe(true);
		expect(secondRequestMessages.some(message => message.role === 'tool' && message.tool_call_id === 'call-2')).toBe(true);
	});

	it('retries required write proposal tasks with a forced write tool when the model stops early', async () => {
		const proposal = {
			type: 'write_proposal',
			operation: 'create',
			path: 'Agentic Agent/Research brief - A.md',
			reason: 'Vault write was not applied. Review this proposal and explicitly confirm before making changes.',
			content: '# Research brief',
			proposedContent: '# Research brief',
		};
		const provider = {
			streamChat: jest.fn()
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({ content: 'I will prepare the research brief as a write proposal.' });
					onChunk({ usage: { promptTokens: 100, completionTokens: 2000, totalTokens: 2100 } });
				})
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({
						toolCalls: [{
							id: 'call-write',
							function: {
								name: 'create_note',
								arguments: JSON.stringify({
									title: 'Research brief - A',
									folder: 'Agentic Agent',
									content: '# Research brief',
								}),
							},
						}],
					});
				})
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({ content: 'Prepared the write proposal.' });
				}),
		};
		const registry = {
			resolveForAgent: jest.fn(() => [{
				llmName: 'create_note',
				toolId: 'builtin:builtin:create_note',
				definition: { description: 'Create note proposal', sideEffects: { vaultWrite: true } },
			}]),
			toOpenAIFunctions: jest.fn(() => [{
				type: 'function',
				function: {
					name: 'create_note',
					description: 'Create note proposal',
					parameters: { type: 'object', properties: {} },
				},
			}]),
			executeTool: jest.fn(async () => ({ success: true, result: proposal })),
		};
		const senseService = {
			sense: jest.fn(async () => ({ userQuery: 'research', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
			formatSenseContext: jest.fn(() => 'sense context'),
		};
		const onToolResult = jest.fn();
		const completed: Message[] = [];
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: createAgentRunStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'deepseek' })),
		});

		await loop.execute(
			[{
				role: 'user',
				content: [
					'When the task asks for a durable artifact, call create_note or write_file so the UI can show a write proposal.',
					'Prepare the final research brief as a write proposal inside folder "Agentic Agent".',
				].join('\n'),
			}],
			{ model: 'deepseek:deepseek-v4-flash', mode: 'agent', agentId: 'agent-1', agents: [{ id: 'agent-1', maxSteps: 4, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult,
				onThought: jest.fn(),
				onComplete: message => completed.push(message),
				onError: error => { throw error; },
			},
		);

		expect(provider.streamChat).toHaveBeenCalledTimes(3);
		const forcedRequest = provider.streamChat.mock.calls[1][0] as any;
		expect(forcedRequest.toolChoice).toEqual({ type: 'function', function: { name: 'create_note' } });
		expect(JSON.stringify(forcedRequest.messages)).toContain('You ended the previous turn without creating the required write proposal.');
		expect(registry.executeTool).toHaveBeenCalledWith('create_note', {
			title: 'Research brief - A',
			folder: 'Agentic Agent',
			content: '# Research brief',
		});
		expect(onToolResult).toHaveBeenCalledWith('create_note', true, JSON.stringify(proposal), 'act');
		expect(completed[0].content).toBe('Prepared the write proposal.');
	});

	it('strips incomplete tool call history before sending provider requests', async () => {
		const provider = {
			streamChat: jest.fn(async (_request, onChunk) => {
				onChunk({ content: 'safe answer' });
			}),
		};
		const registry = {
			resolveForAgent: jest.fn(() => []),
			toOpenAIFunctions: jest.fn(() => []),
			executeTool: jest.fn(),
		};
		const senseService = {
			sense: jest.fn(async () => ({ userQuery: 'continue', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
			formatSenseContext: jest.fn(() => 'sense context'),
		};
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: createAgentRunStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'deepseek' })),
		});

		await loop.execute(
			[
				{ role: 'user', content: 'previous request' },
				{
					role: 'assistant',
					content: '',
					tool_calls: [{
						id: 'missing-result',
						type: 'function',
						function: { name: 'read_file', arguments: '{}' },
					}],
				} as any,
				{ role: 'user', content: 'continue' },
			],
			{ model: 'deepseek:deepseek-chat', mode: 'agent', agentId: 'agent-1', agents: [] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult: jest.fn(),
				onThought: jest.fn(),
				onComplete: jest.fn(),
				onError: error => { throw error; },
			},
		);

		const sentMessages = provider.streamChat.mock.calls[0][0].messages as any[];
		expect(JSON.stringify(sentMessages)).not.toContain('tool_calls');
		expect(sentMessages.some(message => message.role === 'tool')).toBe(false);
	});

	it('persists kernel run state and logs through the configured StateStore', async () => {
		const provider = {
			streamChat: jest.fn(async (_request, onChunk) => {
				onChunk({ content: 'persistent answer' });
			}),
		};
		const registry = {
			resolveForAgent: jest.fn(() => []),
			toOpenAIFunctions: jest.fn(() => []),
			executeTool: jest.fn(),
		};
		const senseService = {
			sense: jest.fn(async () => ({ userQuery: 'persist', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
			formatSenseContext: jest.fn(() => 'sense context'),
		};
		const adapter = new MemoryAdapter();
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: new ObsidianAgentRunStateStore({ vault: { adapter } } as any, '.obsidian/test/agent-runs'),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute(
			[{ role: 'user', content: 'persist' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: [] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult: jest.fn(),
				onThought: jest.fn(),
				onComplete: jest.fn(),
				onError: error => { throw error; },
			},
		);

		expect(adapter.files.size).toBe(1);
		const runFile = JSON.parse([...adapter.files.values()][0]);
		expect(runFile.state.status).toBe('completed');
		expect(runFile.logs.map((log: any) => log.type)).toEqual(expect.arrayContaining([
			'task_started',
			'context_built',
			'action_selected',
			'task_completed',
		]));
	});
});
