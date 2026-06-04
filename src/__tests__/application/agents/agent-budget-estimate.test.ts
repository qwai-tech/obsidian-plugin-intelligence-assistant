/**
 * Agent self-estimated step budget: the agent declares `<!-- ESTIMATED_STEPS: N -->`
 * on its first turn, which sets the working budget (clamped to [floor, ceiling]).
 * The marker is an invisible HTML comment and must be stripped from the answer.
 */
import { AgentEngineLoop, HistoryCompactor } from '@/application/agents';
import { InMemoryStateStore } from '@/application/agents/kernel/agent-engine-core';
import type { Message } from '@/types';

const senseStub = () => ({
	sense: jest.fn(async () => ({ userQuery: 'x', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
	formatSenseContext: jest.fn(() => 'sense context'),
});
const oneTool = () => ({
	resolveForAgent: jest.fn(() => [{ llmName: 'do_thing', toolId: 'builtin:builtin:do_thing', definition: { description: 'Do a thing' } }]),
	toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'do_thing', description: 'Do a thing', parameters: { type: 'object', properties: {} } } }]),
});
const agentWith = (maxSteps: number) => ([{ id: 'a1', maxSteps, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any]);
const baseCallbacks = () => ({ onChunk: jest.fn(), onToolCall: jest.fn(), onToolResult: jest.fn(), onThought: jest.fn() });

const makeLoop = (provider: any, registry: any) => new AgentEngineLoop({
	toolRegistry: registry,
	senseService: senseStub() as any,
	historyCompactor: new HistoryCompactor(),
	webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
	agentRunStateStore: new InMemoryStateStore(),
	createProvider: jest.fn(() => ({ provider, providerId: 'openai' })),
});

describe('Agent self-estimated step budget', () => {
	it('raises the working budget above a small fallback when the agent estimates more', async () => {
		// fallback (agent.maxSteps) = 3, but the agent estimates 10 -> budget clamp(10+3,10,50)=13.
		// Provider never finalizes, so it runs to the budget; without the estimate it would stop at 3.
		const provider = {
			streamChat: jest.fn()
				.mockImplementationOnce(async (_r: any, onChunk: any) => {
					onChunk({ content: 'Plan.\n<!-- ESTIMATED_STEPS: 10 -->' });
					onChunk({ toolCalls: [{ id: `c-${Math.random()}`, function: { name: 'do_thing', arguments: '{}' } }] });
				})
				.mockImplementation(async (_r: any, onChunk: any) => {
					onChunk({ toolCalls: [{ id: `c-${Math.random()}`, function: { name: 'do_thing', arguments: '{}' } }] });
				}),
		};
		const registry = { ...oneTool(), executeTool: jest.fn(async () => ({ success: true, result: 'ok' })) };
		await makeLoop(provider, registry).execute(
			[{ role: 'user', content: 'go' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'a1', agents: agentWith(3) },
			{ ...baseCallbacks(), onComplete: jest.fn(), onError: e => { throw e; } },
		);
		const calls = registry.executeTool.mock.calls.length;
		expect(calls).toBeGreaterThan(3);   // estimate raised the budget past the fallback of 3
		expect(calls).toBeLessThanOrEqual(14); // and stayed near clamp(10+3)=13, well under the ceiling
	});

	it('strips the ESTIMATED_STEPS marker from the final answer (invisible HTML comment)', async () => {
		const provider = {
			streamChat: jest.fn(async (_r: any, onChunk: any) => {
				onChunk({ content: 'Done.\n<!-- ESTIMATED_STEPS: 5 -->' });
			}),
		};
		const registry = { ...oneTool(), executeTool: jest.fn() };
		const completed: Message[] = [];
		await makeLoop(provider, registry).execute(
			[{ role: 'user', content: 'go' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'a1', agents: agentWith(25) },
			{ ...baseCallbacks(), onComplete: m => completed.push(m), onError: e => { throw e; } },
		);
		expect(completed).toHaveLength(1);
		expect(completed[0].content).toContain('Done.');
		expect(completed[0].content).not.toMatch(/ESTIMATED_STEPS/);
	});
});
