import type { Agent } from '../../../src/types';

export function createAgentConfig(overrides: Partial<Agent> = {}): Agent {
	const now = Date.now();
	return {
		id: 'agent-e2e',
		name: 'E2E Agent',
		description: 'E2E seeded agent',
		icon: 'A',
		modelStrategy: { strategy: 'chat-view' },
		temperature: 0.7,
		maxTokens: 2000,
		systemPromptId: 'default',
		contextWindow: 20,
		toolAccess: { sources: { 'builtin:builtin': 'all' } },
		memoryType: 'none',
		memoryConfig: {
			summaryInterval: 10,
			maxMemories: 20,
		},
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 5,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}
