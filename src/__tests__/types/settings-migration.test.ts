/**
 * Phase 5 regression: verify that loading a UserConfig with legacy agent
 * tool fields populates `toolAccess` automatically. Without this wiring
 * the migration function (defined in tool-migrations.ts) is dead code
 * and every user's existing agent stays on the deprecated schema.
 */
import { userConfigToPluginSettings, type UserConfig } from '@/types/settings';
import type { Agent } from '@/types/core/agent';

function makeLegacyAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'legacy-1',
		name: 'Legacy Agent',
		description: '',
		icon: 'bot',
		modelStrategy: { kind: 'fixed', modelId: 'gpt-4o-mini' },
		temperature: 0.7,
		maxTokens: 1024,
		systemPromptId: null,
		contextWindow: 8000,
		enabledBuiltInTools: ['read-file', 'write-file'],
		enabledMcpServers: ['demo-mcp'],
		enabledMcpTools: ['other::tool-x'],
		enabledCLITools: ['cli-a'],
		enabledAllCLITools: false,
		memoryType: 'none',
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 10,
		...overrides,
	} as Agent;
}

describe('userConfigToPluginSettings — agent toolAccess migration', () => {
	it('populates toolAccess.sources from legacy fields when loading', () => {
		const config: UserConfig = {
			agents: {
				list: [makeLegacyAgent()],
			},
		} as UserConfig;

		const settings = userConfigToPluginSettings(config);
		const agent = settings.agents[0];

		expect(agent.toolAccess).toBeDefined();
		const sources = agent.toolAccess.sources;
		expect(sources['builtin:builtin']).toEqual([
			'builtin:builtin:read-file',
			'builtin:builtin:write-file',
		]);
		expect(sources['mcp:demo-mcp']).toBe('all');
		expect(sources['mcp:other']).toEqual(['mcp:other:tool-x']);
		expect(sources['cli:cli-a']).toBe('all');

		// Migration also strips the legacy fields so they don't get re-saved.
		const raw = agent as unknown as Record<string, unknown>;
		expect(raw.enabledBuiltInTools).toBeUndefined();
		expect(raw.enabledMcpServers).toBeUndefined();
		expect(raw.enabledMcpTools).toBeUndefined();
		expect(raw.enabledCLITools).toBeUndefined();
		expect(raw.enabledAllCLITools).toBeUndefined();
	});

	it('leaves agents alone when toolAccess is already present', () => {
		const preset: Agent = makeLegacyAgent({
			id: 'modern-1',
			toolAccess: { sources: { 'builtin:builtin': 'all' } },
		});
		const config: UserConfig = { agents: { list: [preset] } } as UserConfig;

		const settings = userConfigToPluginSettings(config);
		expect(settings.agents[0].toolAccess.sources).toEqual({
			'builtin:builtin': 'all',
		});
	});

	it('handles empty agent list without throwing', () => {
		const config: UserConfig = { agents: { list: [] } } as UserConfig;
		const settings = userConfigToPluginSettings(config);
		expect(settings.agents).toEqual([]);
	});
});
