import { AgentMemoryService } from '@/application/services/agent-memory-service';

describe('AgentMemoryService', () => {
	it('creates empty memory for an unknown agent and persists research log updates', async () => {
		const repository = {
			load: jest.fn(async () => ({ version: 1 as const, updatedAt: 0, agents: {} })),
			save: jest.fn(async () => undefined),
		};
		const service = new AgentMemoryService(repository);

		const initial = await service.getSnapshot('agent-1');
		expect(initial.agentId).toBe('agent-1');
		expect(initial.researchLog).toBe('');

		await service.appendResearchLog('agent-1', 'Inspected Projects/AI.md');

		expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
			agents: expect.objectContaining({
				'agent-1': expect.objectContaining({
					researchLog: 'Inspected Projects/AI.md',
				}),
			}),
		}));
	});

	it('stores user preferences as key value memory', async () => {
		const repository = {
			load: jest.fn(async () => ({ version: 1 as const, updatedAt: 0, agents: {} })),
			save: jest.fn(async () => undefined),
		};
		const service = new AgentMemoryService(repository);

		await service.setPreference('agent-1', 'citationStyle', 'wikilinks');
		const snapshot = await service.getSnapshot('agent-1');

		expect(snapshot.preferences.citationStyle).toBe('wikilinks');
	});
});
