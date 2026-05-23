import { migrateAgentToolAccess, migrateAllAgents } from '../tool-migrations';
import type { Agent } from '@/types/core/agent';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'test-agent',
		name: 'Test Agent',
		description: '',
		icon: 'bot',
		modelStrategy: { strategy: 'default' },
		temperature: 0.7,
		maxTokens: 4000,
		systemPromptId: 'sp-1',
		contextWindow: 20,
		enabledBuiltInTools: [],
		enabledMcpServers: [],
		enabledMcpTools: [],
		enabledCLITools: [],
		enabledAllCLITools: false,
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 50 },
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 10,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	};
}

describe('migrateAgentToolAccess', () => {
	it('does nothing when toolAccess already exists', () => {
		const agent = makeAgent({ toolAccess: { sources: { 'builtin:builtin': 'all' } } });
		expect(migrateAgentToolAccess(agent, [])).toBe(false);
		expect(agent.toolAccess).toEqual({ sources: { 'builtin:builtin': 'all' } });
	});

	it('migrates enabledBuiltInTools into toolIds', () => {
		const agent = makeAgent({ enabledBuiltInTools: ['read_file', 'write_file'] });
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess!.sources['builtin:builtin']).toEqual([
			'builtin:builtin:read_file',
			'builtin:builtin:write_file',
		]);
	});

	it('migrates enabledMcpServers to all', () => {
		const agent = makeAgent({ enabledMcpServers: ['alpha', 'beta'] });
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess!.sources['mcp:alpha']).toBe('all');
		expect(agent.toolAccess!.sources['mcp:beta']).toBe('all');
	});

	it('migrates enabledMcpTools not covered by enabledMcpServers', () => {
		const agent = makeAgent({
			enabledMcpServers: ['alpha'],
			enabledMcpTools: ['alpha::builtin_tool', 'beta::extra_tool'],
		});
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess!.sources['mcp:alpha']).toBe('all');
		expect(agent.toolAccess!.sources['mcp:beta']).toEqual(['mcp:beta:extra_tool']);
	});

	it('migrates enabledAllCLITools to all for every known CLI config', () => {
		const agent = makeAgent({ enabledAllCLITools: true });
		migrateAgentToolAccess(agent, ['cli-1', 'cli-2']);
		expect(agent.toolAccess!.sources['cli:cli-1']).toBe('all');
		expect(agent.toolAccess!.sources['cli:cli-2']).toBe('all');
	});

	it('migrates individual enabledCLITools', () => {
		const agent = makeAgent({ enabledCLITools: ['custom'] });
		migrateAgentToolAccess(agent, ['custom']);
		expect(agent.toolAccess!.sources['cli:custom']).toBe('all');
	});

	it('handles an agent with no tool config at all', () => {
		const agent = makeAgent();
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess).toEqual({ sources: {} });
	});

	it('handles undefined-equivalent old fields', () => {
		const agent = makeAgent({
			enabledBuiltInTools: [],
			enabledMcpServers: [],
			enabledMcpTools: undefined,
			enabledCLITools: undefined,
			enabledAllCLITools: false,
		});
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess).toEqual({ sources: {} });
	});
});

describe('migrateAllAgents', () => {
	it('returns IDs of mutated agents', () => {
		const agents = [
			makeAgent({ id: 'a1', enabledBuiltInTools: ['read_file'] }),
			makeAgent({ id: 'a2', toolAccess: { sources: {} } }),
		];
		const changed = migrateAllAgents(agents, []);
		expect(changed.has('a1')).toBe(true);
		expect(changed.has('a2')).toBe(false);
	});
});
