import { ObsidianSettingsPersistence } from '@/bootstrap/obsidian-settings-persistence';
import { PluginDataService } from '@/bootstrap/plugin-data-service';
import { LegacySettingsFiles } from '@/adapters/persistence/legacy-settings-files';
import { pluginPaths } from '@/core/plugin-paths';
import { SettingsStore } from '@/features/settings/settings-store';
import { DEFAULT_SETTINGS, pluginSettingsToUserConfig } from '@/features/settings/settings-codec';
import { toSettingsDocument } from '@/features/settings/settings-document';
import type { SecretVault } from '@/features/settings/settings-secrets';

const BASE = '.obsidian/plugins/intelligence-assistant';
const paths = pluginPaths(BASE);

function makeHost(files: Record<string, unknown> = {}, data: unknown = null) {
	const store: Record<string, string> = Object.fromEntries(Object.entries(files).map(([path, value]) => [path, JSON.stringify(value)]));
	const adapter = {
		exists: jest.fn(async (path: string) => path in store || Object.keys(store).some(file => file.startsWith(`${path}/`))),
		read: jest.fn(async (path: string) => {
			if (!(path in store)) throw new Error(`File not found: ${path}`);
			return store[path];
		}),
		write: jest.fn(async (path: string, value: string) => { store[path] = value; }),
		remove: jest.fn(async (path: string) => { delete store[path]; }),
		rmdir: jest.fn(async (folder: string) => {
			for (const file of Object.keys(store).filter(path => path.startsWith(`${folder}/`))) delete store[file];
		}),
		rename: jest.fn(async (from: string, to: string) => { store[to] = store[from]; delete store[from]; }),
		mkdir: jest.fn(async () => {}),
		list: jest.fn(async (folder: string) => ({ files: Object.keys(store).filter(path => path.startsWith(`${folder}/`)), folders: [] })),
	};
	const app = { vault: { adapter, createFolder: jest.fn(async () => {}) } };
	const plugin = {
		app,
		data,
		loadData: jest.fn(async function (this: { data: unknown }) { return this.data; }),
		saveData: jest.fn(async function (this: { data: unknown }, value: unknown) { this.data = JSON.parse(JSON.stringify(value)); }),
	};
	const dataService = new PluginDataService(app as never, paths);
	dataService.initialize();
	const persistence = new ObsidianSettingsPersistence(plugin as never, dataService, new LegacySettingsFiles(adapter as never, paths));
	return { persistence, plugin, store };
}

const noSecrets: SecretVault = { get: () => null, set: () => undefined, list: () => [] };

describe('ObsidianSettingsPersistence', () => {
	it('loads settings from data.json', async () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		settings.defaultModel = 'from-data-json';
		settings.llmConfigs = [{ provider: 'openai', apiKeySecret: 'k' }];
		settings.agents = [{ id: 'a1', name: 'Agent', modelStrategy: { strategy: 'default' }, toolAccess: { sources: {} }, maxSteps: 10 } as typeof settings.agents[number]];
		const { persistence, plugin } = makeHost({}, toSettingsDocument(settings));
		const store = new SettingsStore(persistence, noSecrets);

		await store.load();

		expect(store.current.defaultModel).toBe('from-data-json');
		expect(store.current.llmConfigs).toEqual([{ provider: 'openai', apiKeySecret: 'k' }]);
		expect(store.current.agents.map(agent => agent.id)).toEqual(['a1']);
		expect(plugin.saveData).not.toHaveBeenCalled();
	});

	it('moves settings from the old per-file layout into data.json and removes the old files', async () => {
		const config = pluginSettingsToUserConfig({ ...structuredClone(DEFAULT_SETTINGS), defaultModel: 'old-layout' });
		const { persistence, plugin, store: files } = makeHost({
			[paths.userConfig]: config,
			[paths.providers]: { version: 1, providers: [{ provider: 'ollama' }] },
			[`${paths.agents}/index.json`]: { version: '1.0', activeId: 'a1', agents: [{ id: 'a1', file: `${paths.agents}/agent-a1.json` }] },
			[`${paths.agents}/agent-a1.json`]: { id: 'a1', name: 'Old agent' },
			[`${paths.prompts}/index.json`]: { version: '1.0', activeId: null, prompts: [{ id: 'p1', file: `${paths.prompts}/prompt-p1.json` }] },
			[`${paths.prompts}/prompt-p1.json`]: { id: 'p1', name: 'Old prompt', content: 'c', enabled: true },
			[paths.mcpServers]: { version: '1.0', servers: [{ name: 'srv', command: 'run', enabled: true }] },
		});
		const store = new SettingsStore(persistence, noSecrets);

		await store.load();

		expect(store.current.defaultModel).toBe('old-layout');
		expect(store.current.llmConfigs).toEqual([{ provider: 'ollama' }]);
		expect(store.current.agents.map(agent => agent.name)).toEqual(['Old agent']);
		expect(store.current.activeAgentId).toBe('a1');
		expect(store.current.systemPrompts.map(prompt => prompt.id)).toEqual(['p1']);
		expect(store.current.mcpServers.map(server => server.name)).toEqual(['srv']);
		const saved = plugin.data as ReturnType<typeof toSettingsDocument>;
		expect(saved.format).toBe(2);
		expect(saved.config.providers.defaultModel).toBe('old-layout');
		expect(saved.agents.list.map(agent => agent.id)).toEqual(['a1']);
		expect(Object.keys(files).filter(path => !path.includes('/cache/'))).toEqual([]);
	});

	it('writes a fresh install straight to data.json', async () => {
		const { persistence, plugin } = makeHost();
		const store = new SettingsStore(persistence, noSecrets);

		await store.load();

		expect((plugin.data as { format?: number }).format).toBe(2);
	});

	it('keeps model caches out of data.json and restores them on load', async () => {
		const { persistence, plugin } = makeHost();
		const store = new SettingsStore(persistence, noSecrets);
		await store.load();

		await store.update(settings => {
			settings.llmConfigs = [{ provider: 'ollama', cachedModels: [{ id: 'llama', name: 'Llama', provider: 'ollama', capabilities: ['chat'] }], cacheTimestamp: 1 }];
		});
		expect(JSON.stringify(plugin.data)).not.toContain('cachedModels');

		const reloaded = new SettingsStore(persistence, noSecrets);
		await reloaded.load();
		expect(reloaded.current.llmConfigs[0].cachedModels?.map(model => model.id)).toEqual(['llama']);
	});

	it('backs up an old data.json before replacing it', async () => {
		const legacy = { defaultModel: 'legacy', conversations: [{ id: 'c1', title: 'Old chat', messages: [] }] };
		const { persistence, plugin, store: files } = makeHost({}, legacy);
		const store = new SettingsStore(persistence, noSecrets);

		await store.load();

		expect(JSON.parse(files[`${paths.data}/legacy-data-backup.json`])).toEqual(legacy);
		expect((plugin.data as { format?: number }).format).toBe(2);
		expect(store.legacyConversations.map(conversation => conversation.id)).toEqual(['c1']);
	});
});
