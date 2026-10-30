import { SettingsStore, type PersistUnit, type SettingsPersistence, type StoredSettings } from '@/features/settings/settings-store';
import { DEFAULT_SETTINGS, pluginSettingsToUserConfig, userConfigToPluginSettings } from '@/features/settings/settings-codec';
import type { LLMConfig } from '@/features/llm/types/model';
import type { PluginSettings } from '@/features/settings/types/settings';
import type { SecretVault } from '@/features/settings/settings-secrets';

const fakePersistence = (stored: StoredSettings, hydrated: Partial<PluginSettings> = {}) => {
	const writes: Array<Set<PersistUnit>> = [];
	const written: string[] = [];
	const persistence: SettingsPersistence = {
		read: async () => stored,
		hydrate: async () => hydrated,
		write: async (settings, units) => {
			writes.push(new Set(units));
			written.push(JSON.stringify(settings));
		},
	};
	return { persistence, writes, written };
};

const memoryVault = (initial: Record<string, string> = {}): SecretVault & { secrets: Map<string, string> } => {
	const secrets = new Map(Object.entries(initial));
	return {
		secrets,
		get: (id) => secrets.get(id) ?? null,
		set: (id, value) => { secrets.set(id, value); },
		list: () => [...secrets.keys()],
	};
};

const currentConfig = () => pluginSettingsToUserConfig(userConfigToPluginSettings(null));

describe('SettingsStore', () => {
	it('loads the user config and lays repository data over it', async () => {
		const config = currentConfig();
		config.providers.defaultModel = 'model-from-config';
		const providers = [{ provider: 'openai', apiKey: 'k' }] as LLMConfig[];
		const { persistence } = fakePersistence({ userConfig: config, legacyData: null, outdated: false }, { llmConfigs: providers });
		const store = new SettingsStore(persistence, memoryVault());

		await store.load();

		expect(store.current.defaultModel).toBe('model-from-config');
		expect(store.current.llmConfigs).toBe(providers);
	});

	it('falls back to legacy data.json, keeps its conversations aside and writes a config file', async () => {
		const legacy = { defaultModel: 'legacy-model', conversations: [{ id: 'c1' }] };
		const { persistence, writes } = fakePersistence({ userConfig: null, legacyData: legacy, outdated: false });
		const store = new SettingsStore(persistence, memoryVault());

		await store.load();

		expect(store.current.defaultModel).toBe('legacy-model');
		expect(store.legacyConversations.map((c) => c.id)).toEqual(['c1']);
		expect(writes[0].has('config')).toBe(true);
	});

	it('persists migrated agents right after loading', async () => {
		const legacyAgent = { id: 'a1', name: 'Old', modelId: 'm1', toolAccess: { sources: {} } };
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false }, { agents: [legacyAgent] as never });
		const store = new SettingsStore(persistence, memoryVault());

		await store.load();

		expect(store.current.agents[0].modelStrategy).toEqual({ strategy: 'fixed', modelId: 'm1' });
		expect(writes).toHaveLength(1);
		expect(writes[0].has('agents')).toBe(true);
	});

	it('writes every unit when the stored settings are in an outdated format', async () => {
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: true });
		const store = new SettingsStore(persistence, memoryVault());

		await store.load();

		expect(writes).toEqual([new Set(['config', 'providers', 'prompts', 'agents', 'mcp'])]);
	});

	it('saves only the units that changed, and nothing when nothing changed', async () => {
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false });
		const store = new SettingsStore(persistence, memoryVault());
		await store.load();

		store.current.ragConfig.chunkSize = 777;
		await store.save();
		await store.save();

		expect(writes).toEqual([new Set(['config'])]);
	});

	it('tells subscribers which units changed', async () => {
		const { persistence } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false });
		const store = new SettingsStore(persistence, memoryVault());
		await store.load();
		const listener = jest.fn();
		store.onChange(listener);

		store.current.llmConfigs.push({ provider: 'ollama' } as LLMConfig);
		store.current.defaultModel = 'other';
		await store.save();

		expect(listener).toHaveBeenCalledWith(new Set(['providers', 'config']));
	});

	it('applies a change and saves only the units it touched', async () => {
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false });
		const store = new SettingsStore(persistence, memoryVault());
		await store.load();
		const listener = jest.fn();
		store.onChange(listener);

		await store.update(settings => { settings.defaultModel = 'changed'; });

		expect(store.current.defaultModel).toBe('changed');
		expect(writes.at(-1)).toEqual(new Set(['config']));
		expect(listener).toHaveBeenCalledWith(new Set(['config']));
	});

	it('never shares nested objects with the defaults', async () => {
		const { persistence } = fakePersistence({ userConfig: null, legacyData: null, outdated: false });
		const store = new SettingsStore(persistence, memoryVault());
		await store.load();

		store.current.ragConfig.chunkSize = 1;

		expect(DEFAULT_SETTINGS.ragConfig.chunkSize).not.toBe(1);
	});

	it('moves plain-text keys into the vault on load and never writes them', async () => {
		const vault = memoryVault();
		const providers = [{ provider: 'openai', apiKey: 'sk-plain' }] as LLMConfig[];
		const { persistence, writes, written } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false }, { llmConfigs: providers });
		const store = new SettingsStore(persistence, vault);

		await store.load();

		expect(vault.secrets.get('intelligence-assistant-openai')).toBe('sk-plain');
		expect(store.current.llmConfigs[0]).toEqual({ provider: 'openai', apiKey: 'sk-plain', apiKeySecret: 'intelligence-assistant-openai' });
		expect(writes).toEqual([new Set(['providers', 'config'])]);
		expect(written.join()).not.toContain('sk-plain');
	});

	it('reads keys from the vault by their secret name', async () => {
		const vault = memoryVault({ mine: 'sk-vault' });
		const providers = [{ provider: 'openai', apiKeySecret: 'mine' }] as LLMConfig[];
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false }, { llmConfigs: providers });
		const store = new SettingsStore(persistence, vault);

		await store.load();

		expect(store.current.llmConfigs[0].apiKey).toBe('sk-vault');
		expect(writes).toEqual([]);
	});

	it('keeps keys out of saves and saves nothing when only a key changed', async () => {
		const vault = memoryVault({ mine: 'sk-vault' });
		const providers = [{ provider: 'openai', apiKeySecret: 'mine' }] as LLMConfig[];
		const { persistence, writes, written } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false }, { llmConfigs: providers });
		const store = new SettingsStore(persistence, vault);
		await store.load();

		store.current.llmConfigs[0].apiKey = 'sk-other';
		await store.save();
		store.current.llmConfigs[0].apiKeySecret = 'other';
		await store.save();

		expect(writes).toEqual([new Set(['providers'])]);
		expect(written.join()).not.toContain('sk-');
	});

	it('reads the key for a newly chosen secret as part of an update', async () => {
		const vault = memoryVault({ first: 'sk-1', second: 'sk-2' });
		const providers = [{ provider: 'openai', apiKeySecret: 'first' }] as LLMConfig[];
		const { persistence } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false }, { llmConfigs: providers });
		const store = new SettingsStore(persistence, vault);
		await store.load();

		await store.update(settings => { settings.llmConfigs[0].apiKeySecret = 'second'; });

		expect(store.current.llmConfigs[0].apiKey).toBe('sk-2');
	});

	it('picks up keys changed in the vault when asked to', async () => {
		const vault = memoryVault({ mine: 'sk-old' });
		const providers = [{ provider: 'openai', apiKeySecret: 'mine' }] as LLMConfig[];
		const { persistence } = fakePersistence({ userConfig: currentConfig(), legacyData: null, outdated: false }, { llmConfigs: providers });
		const store = new SettingsStore(persistence, vault);
		await store.load();

		vault.set('mine', 'sk-new');
		store.refreshKeys();

		expect(store.current.llmConfigs[0].apiKey).toBe('sk-new');
	});
});
