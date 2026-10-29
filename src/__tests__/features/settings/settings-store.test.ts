import { SettingsStore, type PersistUnit, type SettingsPersistence, type StoredSettings } from '@/features/settings/settings-store';
import { DEFAULT_SETTINGS, pluginSettingsToUserConfig, userConfigToPluginSettings } from '@/features/settings/settings-codec';
import type { LLMConfig } from '@/features/llm/types/model';
import type { PluginSettings } from '@/features/settings/types/settings';

const fakePersistence = (stored: StoredSettings, hydrated: Partial<PluginSettings> = {}) => {
	const writes: Array<Set<PersistUnit>> = [];
	const persistence: SettingsPersistence = {
		read: async () => stored,
		hydrate: async () => hydrated,
		write: async (_settings, units) => {
			writes.push(new Set(units));
		},
	};
	return { persistence, writes };
};

const currentConfig = () => pluginSettingsToUserConfig(userConfigToPluginSettings(null));

describe('SettingsStore', () => {
	it('loads the user config and lays repository data over it', async () => {
		const config = currentConfig();
		config.providers.defaultModel = 'model-from-config';
		const providers = [{ provider: 'openai', apiKey: 'k' }] as LLMConfig[];
		const { persistence } = fakePersistence({ userConfig: config, legacyData: null }, { llmConfigs: providers });
		const store = new SettingsStore(persistence);

		await store.load();

		expect(store.current.defaultModel).toBe('model-from-config');
		expect(store.current.llmConfigs).toBe(providers);
	});

	it('falls back to legacy data.json, keeps its conversations aside and writes a config file', async () => {
		const legacy = { defaultModel: 'legacy-model', conversations: [{ id: 'c1' }] };
		const { persistence, writes } = fakePersistence({ userConfig: null, legacyData: legacy });
		const store = new SettingsStore(persistence);

		await store.load();

		expect(store.current.defaultModel).toBe('legacy-model');
		expect(store.legacyConversations.map((c) => c.id)).toEqual(['c1']);
		expect(writes[0].has('config')).toBe(true);
	});

	it('persists migrated agents right after loading', async () => {
		const legacyAgent = { id: 'a1', name: 'Old', modelId: 'm1', toolAccess: { sources: {} } };
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null }, { agents: [legacyAgent] as never });
		const store = new SettingsStore(persistence);

		await store.load();

		expect(store.current.agents[0].modelStrategy).toEqual({ strategy: 'fixed', modelId: 'm1' });
		expect(writes).toHaveLength(1);
		expect(writes[0].has('agents')).toBe(true);
	});

	it('saves only the units that changed, and nothing when nothing changed', async () => {
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null });
		const store = new SettingsStore(persistence);
		await store.load();

		store.current.ragConfig.chunkSize = 777;
		await store.save();
		await store.save();

		expect(writes).toEqual([new Set(['config'])]);
	});

	it('tells subscribers which units changed', async () => {
		const { persistence } = fakePersistence({ userConfig: currentConfig(), legacyData: null });
		const store = new SettingsStore(persistence);
		await store.load();
		const listener = jest.fn();
		store.onChange(listener);

		store.current.llmConfigs.push({ provider: 'ollama' } as LLMConfig);
		store.current.defaultModel = 'other';
		await store.save();

		expect(listener).toHaveBeenCalledWith(new Set(['providers', 'config']));
	});

	it('applies a change and saves only the units it touched', async () => {
		const { persistence, writes } = fakePersistence({ userConfig: currentConfig(), legacyData: null });
		const store = new SettingsStore(persistence);
		await store.load();
		const listener = jest.fn();
		store.onChange(listener);

		await store.update(settings => { settings.defaultModel = 'changed'; });

		expect(store.current.defaultModel).toBe('changed');
		expect(writes.at(-1)).toEqual(new Set(['config']));
		expect(listener).toHaveBeenCalledWith(new Set(['config']));
	});

	it('never shares nested objects with the defaults', async () => {
		const { persistence } = fakePersistence({ userConfig: null, legacyData: null });
		const store = new SettingsStore(persistence);
		await store.load();

		store.current.ragConfig.chunkSize = 1;

		expect(DEFAULT_SETTINGS.ragConfig.chunkSize).not.toBe(1);
	});
});
