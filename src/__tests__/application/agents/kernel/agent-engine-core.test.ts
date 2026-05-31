import {
	BasicPolicy,
	FakePlanner,
	InMemoryStateStore,
	NoopMemory,
	ToolRegistry,
	createAgentEngine,
} from '@/application/agents/kernel/agent-engine-core';

describe('vendored AgentEngine core', () => {
	it('runs a minimal tool call and final answer through the internal shim', async () => {
		const tools = new ToolRegistry();
		tools.register({
			name: 'echo',
			description: 'Echo text',
			inputSchema: {
				type: 'object',
				properties: {
					text: { type: 'string' },
				},
				required: ['text'],
				additionalProperties: false,
			},
			sideEffectLevel: 'none',
			requiredScopes: [],
			execute: async args => ({
				text: typeof args.text === 'string' ? args.text : '',
			}),
		});

		const engine = createAgentEngine({
			planner: new FakePlanner([
				{
					id: 'action-1',
					type: 'tool_call',
					toolName: 'echo',
					arguments: { text: 'hello' },
					createdAt: '2026-05-29T00:00:00.000Z',
				},
				{
					id: 'action-2',
					type: 'final_answer',
					content: 'done',
					createdAt: '2026-05-29T00:00:01.000Z',
				},
			]),
			stateStore: new InMemoryStateStore(),
			toolRegistry: tools,
			memory: new NoopMemory(),
			policy: new BasicPolicy({
				maxSteps: 4,
				allowedTools: ['echo'],
			}),
		});

		const result = await engine.run({
			agent: {
				id: 'agent-1',
				name: 'Test agent',
				role: 'knowledge assistant',
				goal: 'Prove the vendored kernel can run inside this repo',
				instructions: 'Use tools and finish.',
				tools: ['echo'],
				maxSteps: 4,
			},
			task: {
				id: 'task-1',
				input: 'Run echo',
			},
			host: {
				tenantId: 'local',
				workspaceId: 'test-vault',
				principal: {
					id: 'user-1',
					type: 'user',
					tenantId: 'local',
				},
				effectiveScopes: [],
			},
		});

		expect(result.status).toBe('completed');
		expect(result.output).toBe('done');
		expect(result.state.observations).toHaveLength(1);
		expect(result.state.observations[0]?.result).toEqual({ text: 'hello' });
	});
});
