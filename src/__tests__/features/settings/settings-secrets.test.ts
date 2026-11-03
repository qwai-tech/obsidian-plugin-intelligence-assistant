import { moveKeysToVault, revealKeys, withoutKeys, type SecretVault } from '@/features/settings/settings-secrets';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-codec';
import type { PluginSettings } from '@/features/settings/types/settings';

const memoryVault = (initial: Record<string, string> = {}): SecretVault & { secrets: Map<string, string> } => {
	const secrets = new Map(Object.entries(initial));
	return {
		secrets,
		get: (id) => secrets.get(id) ?? null,
		set: (id, value) => { secrets.set(id, value); },
		list: () => [...secrets.keys()],
	};
};

const settingsWith = (patch: Partial<PluginSettings>): PluginSettings => ({
	...structuredClone(DEFAULT_SETTINGS),
	...patch,
});

describe('settings secrets', () => {
	it('moves plain-text provider keys into the vault and keeps only the secret name', () => {
		const vault = memoryVault();
		const settings = settingsWith({ llmConfigs: [{ provider: 'openai', apiKey: 'sk-1' }, { provider: 'ollama' }] });

		expect(moveKeysToVault(settings, vault)).toBe(true);

		expect(settings.llmConfigs[0].apiKeySecret).toBe('intelligence-assistant-openai');
		expect(vault.secrets.get('intelligence-assistant-openai')).toBe('sk-1');
		expect(settings.llmConfigs[1].apiKeySecret).toBeUndefined();
	});

	it('gives each provider its own secret name, avoiding names already in the vault', () => {
		const vault = memoryVault({ 'intelligence-assistant-openai': 'someone-else' });
		const settings = settingsWith({ llmConfigs: [{ provider: 'openai', apiKey: 'a' }, { provider: 'openai', apiKey: 'b' }] });

		moveKeysToVault(settings, vault);

		expect(settings.llmConfigs.map((config) => config.apiKeySecret)).toEqual(['intelligence-assistant-openai-2', 'intelligence-assistant-openai-3']);
		expect(vault.secrets.get('intelligence-assistant-openai')).toBe('someone-else');
	});

	it('turns provider ids into valid secret names', () => {
		const vault = memoryVault();
		const settings = settingsWith({ llmConfigs: [{ provider: 'My Provider_1', apiKey: 'a' }] });

		moveKeysToVault(settings, vault);

		expect(settings.llmConfigs[0].apiKeySecret).toBe('intelligence-assistant-my-provider-1');
	});

	it('moves web search keys into the vault', () => {
		const vault = memoryVault();
		const settings = settingsWith({});
		settings.webSearchConfig = { ...settings.webSearchConfig, apiKey: 'serp', tavilyApiKey: 'tav' };

		expect(moveKeysToVault(settings, vault)).toBe(true);

		expect(settings.webSearchConfig.apiKeySecret).toBe('intelligence-assistant-web-search');
		expect(settings.webSearchConfig.tavilyApiKeySecret).toBe('intelligence-assistant-web-search-tavily');
		expect(vault.secrets.get('intelligence-assistant-web-search-tavily')).toBe('tav');
	});

	it('leaves keys that already have a secret name alone', () => {
		const vault = memoryVault({ chosen: 'from-vault' });
		const settings = settingsWith({ llmConfigs: [{ provider: 'openai', apiKey: 'from-vault', apiKeySecret: 'chosen' }] });

		expect(moveKeysToVault(settings, vault)).toBe(false);
		expect(vault.secrets.size).toBe(1);
	});

	it('reveals keys from the vault, clearing keys whose secret is gone', () => {
		const vault = memoryVault({ chosen: 'sk-live' });
		const settings = settingsWith({
			llmConfigs: [{ provider: 'openai', apiKeySecret: 'chosen' }, { provider: 'anthropic', apiKey: 'stale', apiKeySecret: 'deleted' }],
		});
		settings.webSearchConfig = { ...settings.webSearchConfig, braveApiKeySecret: 'chosen' };

		revealKeys(settings, vault);

		expect(settings.llmConfigs[0].apiKey).toBe('sk-live');
		expect(settings.llmConfigs[1].apiKey).toBeUndefined();
		expect(settings.webSearchConfig.braveApiKey).toBe('sk-live');
	});

	it('forgets a web search key once its secret is unlinked', () => {
		const vault = memoryVault({ chosen: 'sk-live' });
		const settings = settingsWith({});
		settings.webSearchConfig = { ...settings.webSearchConfig, braveApiKeySecret: 'chosen' };
		revealKeys(settings, vault);

		settings.webSearchConfig.braveApiKeySecret = undefined;
		revealKeys(settings, vault);

		expect(settings.webSearchConfig.braveApiKey).toBeUndefined();
	});

	it('strips every key from the copy it returns, leaving the settings untouched', () => {
		const settings = settingsWith({ llmConfigs: [{ provider: 'openai', apiKey: 'sk', apiKeySecret: 'chosen' }] });
		settings.webSearchConfig = { ...settings.webSearchConfig, apiKey: 'serp', apiKeySecret: 'web' };

		const stored = withoutKeys(settings);

		expect(stored.llmConfigs[0]).toEqual({ provider: 'openai', apiKeySecret: 'chosen' });
		expect(stored.webSearchConfig.apiKey).toBeUndefined();
		expect(stored.webSearchConfig.apiKeySecret).toBe('web');
		expect(JSON.stringify(stored)).not.toContain('serp');
		expect(settings.llmConfigs[0].apiKey).toBe('sk');
		expect(settings.webSearchConfig.apiKey).toBe('serp');
	});

	it('moves a plain-text HTTP source credential into the vault, reveals it at runtime and never stores it', () => {
		const vault = memoryVault();
		const source = { id: 'ux-auth', name: 'UX auth source', enabled: true, sourceType: 'file' as const, authType: 'header' as const, authKey: 'X-Api-Key', authValue: 'ux-secret-9931' };
		const settings = settingsWith({ openApiTools: [source] });

		expect(moveKeysToVault(settings, vault)).toBe(true);
		expect(settings.openApiTools[0].authValueSecret).toBe('intelligence-assistant-http-ux-auth');
		expect(vault.secrets.get('intelligence-assistant-http-ux-auth')).toBe('ux-secret-9931');

		settings.openApiTools[0].authValue = undefined;
		revealKeys(settings, vault);
		expect(settings.openApiTools[0].authValue).toBe('ux-secret-9931');
		expect(JSON.stringify(withoutKeys(settings))).not.toContain('ux-secret-9931');
	});
});
