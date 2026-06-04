/**
 * Autonomous reliability verification for the agent loop's adverse-condition
 * behaviour: the edges NOT covered by agent-engine-loop.test.ts.
 *
 * These are deterministic (fake provider) checks of the property that matters
 * most for "is the agent reliable": under failure / runaway / abort, does the
 * loop stay BOUNDED, TERMINATE, and surface a sane outcome (no hang, no
 * infinite tool spinning, no silent success)?
 *
 * Model-quality reliability (does a real LLM pick the right tools) is out of
 * scope here — that needs real API calls.
 */
import { AgentEngineLoop, HistoryCompactor } from '@/application/agents';
import { InMemoryStateStore } from '@/application/agents/kernel/agent-engine-core';

const senseStub = () => ({
	sense: jest.fn(async () => ({ userQuery: 'x', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
	formatSenseContext: jest.fn(() => 'sense context'),
});

const oneTool = () => ({
	resolveForAgent: jest.fn(() => [{ llmName: 'do_thing', toolId: 'builtin:builtin:do_thing', definition: { description: 'Do a thing' } }]),
	toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'do_thing', description: 'Do a thing', parameters: { type: 'object', properties: {} } } }]),
});

const agentWith = (maxSteps: number) => ([{ id: 'agent-1', maxSteps, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any]);

const baseCallbacks = () => ({
	onChunk: jest.fn(), onToolCall: jest.fn(), onToolResult: jest.fn(), onThought: jest.fn(),
});

describe('Agent loop reliability under adverse conditions', () => {
	it('S1 — runaway model that never finalizes is bounded by maxSteps (no infinite loop)', async () => {
		// Provider ALWAYS asks for a tool, never produces a final answer.
		const provider = {
			streamChat: jest.fn(async (_req, onChunk) => {
				onChunk({ toolCalls: [{ id: `call-${Math.random()}`, function: { name: 'do_thing', arguments: '{}' } }] });
			}),
		};
		const registry = { ...oneTool(), executeTool: jest.fn(async () => ({ success: true, result: 'ok' })) };
		const onComplete = jest.fn();
		const onError = jest.fn();
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any, senseService: senseStub() as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: new InMemoryStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute([{ role: 'user', content: 'go' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: agentWith(3) },
			{ ...baseCallbacks(), onComplete, onError });

		// Bounded: at most maxSteps tool executions, and it TERMINATED (reaching
		// this line means no hang). max_steps_reached is a graceful stop, not an error.
		expect(registry.executeTool.mock.calls.length).toBeLessThanOrEqual(3);
		expect(registry.executeTool.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(onError).not.toHaveBeenCalled();
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it('S2 — a tool that always fails trips the circuit breaker instead of spinning', async () => {
		const provider = {
			streamChat: jest.fn(async (_req, onChunk) => {
				onChunk({ toolCalls: [{ id: `call-${Math.random()}`, function: { name: 'do_thing', arguments: '{}' } }] });
			}),
		};
		const registry = { ...oneTool(), executeTool: jest.fn(async () => ({ success: false, error: 'boom' })) };
		const onError = jest.fn();
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any, senseService: senseStub() as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: new InMemoryStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute([{ role: 'user', content: 'go' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: agentWith(20) },
			{ ...baseCallbacks(), onComplete: jest.fn(), onError });

		// Should stop near the failure budget (3), NOT run all 20 steps.
		expect(registry.executeTool.mock.calls.length).toBeLessThanOrEqual(4);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(String(onError.mock.calls[0][0]?.message ?? '')).toMatch(/fail/i);
	});

	it('S3 — abort signal stops the loop cleanly without an error', async () => {
		const provider = {
			streamChat: jest.fn(async (_req, onChunk) => { onChunk({ content: 'partial' }); }),
		};
		const registry = { ...oneTool(), executeTool: jest.fn() };
		const onComplete = jest.fn();
		const onError = jest.fn();
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any, senseService: senseStub() as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: new InMemoryStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute([{ role: 'user', content: 'go' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: agentWith(10) },
			{ ...baseCallbacks(), onComplete, onError, checkAbort: () => true });

		expect(registry.executeTool).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled(); // abort is not an error
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it('S4 — recovers from a single tool failure and still produces a final answer', async () => {
		const provider = {
			streamChat: jest.fn()
				.mockImplementationOnce(async (_req: any, onChunk: any) => {
					onChunk({ toolCalls: [{ id: 'call-1', function: { name: 'do_thing', arguments: '{}' } }] });
				})
				.mockImplementationOnce(async (_req: any, onChunk: any) => {
					onChunk({ content: 'recovered and answered' });
				}),
		};
		const registry = { ...oneTool(), executeTool: jest.fn(async () => ({ success: false, error: 'transient' })) };
		const onToolResult = jest.fn();
		const onComplete = jest.fn();
		const loop = new AgentEngineLoop({
			toolRegistry: registry as any, senseService: senseStub() as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			agentRunStateStore: new InMemoryStateStore(),
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute([{ role: 'user', content: 'go' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: agentWith(10) },
			{ ...baseCallbacks(), onToolResult, onComplete, onError: e => { throw e; } });

		// Failure surfaced to the model, then a clean final answer.
		expect(onToolResult).toHaveBeenCalledWith('do_thing', false, expect.stringMatching(/transient/), 'act');
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete.mock.calls[0][0].content).toBe('recovered and answered');
	});
});
