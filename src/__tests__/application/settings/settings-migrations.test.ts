import { userConfigToPluginSettings } from '@/application/settings/settings-codec';
import { migrateSettings } from '@/application/settings/settings-migrations';
import type { UserConfig } from '@/types/settings';
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

const load = (config: UserConfig) => {
	const settings = userConfigToPluginSettings(config);
	migrateSettings(settings);
	return settings;
};

describe('migrateSettings — agent toolAccess', () => {
	it('populates toolAccess.sources from legacy fields when loading', () => {
		const config: UserConfig = {
			agents: {
				list: [makeLegacyAgent()],
			},
		} as UserConfig;

		const settings = load(config);
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

		const settings = load(config);
		expect(settings.agents[0].toolAccess.sources).toEqual({
			'builtin:builtin': 'all',
		});
	});

	it('handles empty agent list without throwing', () => {
		const config: UserConfig = { agents: { list: [] } } as UserConfig;
		const settings = load(config);
		expect(settings.agents).toEqual([]);
	});
});

describe('migrateSettings — agent model strategy', () => {
	const agentWith = (fields: Record<string, unknown>): Agent => {
		const agent = makeLegacyAgent({ toolAccess: { sources: {} } }) as unknown as Record<string, unknown>;
		delete agent.modelStrategy;
		return { ...agent, ...fields } as unknown as Agent;
	};

	it('turns a legacy modelId into a fixed strategy and drops the old field', () => {
		const settings = userConfigToPluginSettings(null);
		settings.agents = [agentWith({ modelId: 'claude-x' })];

		expect(migrateSettings(settings)).toBe(true);

		expect(settings.agents[0].modelStrategy).toEqual({ strategy: 'fixed', modelId: 'claude-x' });
		expect('modelId' in settings.agents[0]).toBe(false);
	});

	it('gives an agent without a strategy the default model', () => {
		const settings = userConfigToPluginSettings(null);
		settings.defaultModel = 'gpt-default';
		settings.agents = [agentWith({})];

		migrateSettings(settings);

		expect(settings.agents[0].modelStrategy).toEqual({ strategy: 'default', modelId: 'gpt-default' });
	});

	it('reports no change for settings that are already current', () => {
		const settings = userConfigToPluginSettings(null);
		settings.agents = [makeLegacyAgent({ toolAccess: { sources: {} }, modelStrategy: { strategy: 'default' } } as Partial<Agent>)];
		migrateSettings(settings);

		expect(migrateSettings(settings)).toBe(false);
	});
});

describe('migrateSettings — removed SAP AI Core provider', () => {
	const sapSettings = () => {
		const settings = userConfigToPluginSettings(null);
		settings.llmConfigs = [
			{ provider: 'sap-ai-core', serviceKey: '{}' } as never,
			{ provider: 'openai', apiKey: 'k' },
		];
		settings.defaultModel = 'sap-ai-core:gpt-4o';
		settings.agents = [makeLegacyAgent({ id: 'a', modelStrategy: { strategy: 'fixed', modelId: 'sap-ai-core:gpt-4o' } })];
		return settings;
	};

	it('drops SAP provider configs and models that point at them', () => {
		const settings = sapSettings();

		expect(migrateSettings(settings)).toBe(true);

		expect(settings.llmConfigs.map(config => config.provider)).toEqual(['openai']);
		expect(settings.defaultModel).toBe('');
		expect(settings.agents[0].modelStrategy).toEqual({ strategy: 'default' });
	});

	it('reports no change when no SAP config is present', () => {
		const settings = userConfigToPluginSettings(null);
		settings.llmConfigs = [{ provider: 'openai', apiKey: 'k' }];
		settings.agents = [];

		expect(migrateSettings(settings)).toBe(false);
	});
});
