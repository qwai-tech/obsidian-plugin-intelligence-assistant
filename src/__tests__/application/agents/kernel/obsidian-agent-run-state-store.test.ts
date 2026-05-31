import { ObsidianAgentRunStateStore } from '@/application/agents';
import type { AgentState } from '@/application/agents/kernel/agent-engine-core';

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
		if (content === undefined) {
			throw new Error(`Missing file: ${path}`);
		}
		return content;
	});
}

function createStore(adapter = new MemoryAdapter()) {
	return {
		adapter,
		store: new ObsidianAgentRunStateStore({ vault: { adapter } } as any, '.obsidian/test/agent-runs'),
	};
}

describe('ObsidianAgentRunStateStore', () => {
	it('persists agent state and execution logs through the StateStore contract', async () => {
		const { adapter, store } = createStore();
		const state = await store.create({
			agent: {
				id: 'agent-1',
				name: 'Agent',
				role: 'knowledge-agent',
				goal: 'Test persistence',
				instructions: 'Use tools.',
				tools: ['echo'],
				maxSteps: 3,
			},
			task: {
				id: 'task-1',
				input: 'hello',
			},
			host: {
				tenantId: 'local',
				workspaceId: 'vault-1',
				principal: {
					id: 'user-1',
					type: 'user',
					tenantId: 'local',
				},
				effectiveScopes: ['vault.read'],
			},
		});

		expect(adapter.files.size).toBe(1);
		await expect(store.load(state.runId)).resolves.toMatchObject({
			runId: state.runId,
			status: 'running',
			version: 1,
		});
		await expect(store.listLog(state.runId)).resolves.toMatchObject([
			{
				runId: state.runId,
				sequence: 1,
				type: 'task_started',
				payload: {
					agentId: 'agent-1',
					taskId: 'task-1',
					effectiveScopes: ['vault.read'],
				},
			},
		]);

		const saved = await store.save({
			...state,
			step: 1,
			observations: [
				{
					id: 'observation-1',
					actionId: 'action-1',
					success: true,
					result: { ok: true },
					startedAt: state.createdAt,
					completedAt: state.createdAt,
				},
			],
		} satisfies AgentState);

		expect(saved.version).toBe(2);
		await store.appendLog({
			id: 'event-2',
			runId: state.runId,
			type: 'tool_completed',
			timestamp: state.createdAt,
			payload: { actionId: 'action-1', toolName: 'echo' },
			principalId: 'user-1',
			tenantId: 'local',
			workspaceId: 'vault-1',
		});

		await expect(store.load(state.runId)).resolves.toMatchObject({
			runId: state.runId,
			step: 1,
			version: 2,
		});
		const logs = await store.listLog(state.runId);
		expect(logs.map(log => log.sequence)).toEqual([1, 2]);
		expect(logs[1]).toMatchObject({
			schemaVersion: expect.any(String),
			type: 'tool_completed',
		});
	});

	it('rejects stale state saves with a kernel version conflict', async () => {
		const { store } = createStore();
		const state = await store.create({
			agent: {
				id: 'agent-1',
				name: 'Agent',
				role: 'knowledge-agent',
				goal: 'Test conflict',
				instructions: 'Use tools.',
				tools: [],
			},
			task: {
				id: 'task-1',
				input: 'hello',
			},
			host: {
				tenantId: 'local',
				principal: {
					id: 'user-1',
					type: 'user',
					tenantId: 'local',
				},
				effectiveScopes: [],
			},
		});
		await store.save({ ...state, step: 1 });

		await expect(store.save({ ...state, step: 2 })).rejects.toMatchObject({
			code: 'STATE_VERSION_CONFLICT',
		});
	});
});
