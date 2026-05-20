// src/__tests__/application/plugin-data-service.test.ts
import { PluginDataService } from '../../application/services/plugin-data-service';
import type { PluginSettings } from '../../types';

function makeApp(files: Record<string, string> = {}) {
	const store: Record<string, string> = { ...files };
	const adapter = {
		exists: jest.fn(async (path: string) => path in store),
		read: jest.fn(async (path: string) => {
			if (!(path in store)) throw new Error(`File not found: ${path}`);
			return store[path];
		}),
		write: jest.fn(async (path: string, data: string) => { store[path] = data; }),
		remove: jest.fn(async (path: string) => { delete store[path]; }),
		mkdir: jest.fn(async () => {}),
		list: jest.fn(async () => ({ files: [], folders: [] })),
	};
	const vault = { adapter, createFolder: jest.fn(async () => {}) };
	return { app: { vault } as any, store };
}

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
	return {
		llmConfigs: [],
		systemPrompts: [],
		activeSystemPromptId: null,
		agents: [],
		activeAgentId: null,
		mcpServers: [],
		defaultModel: '',
		ragConfig: { enabled: false } as any,
		webSearchConfig: { enabled: false } as any,
		builtInTools: [],
		quickActions: [],
		quickActionPrefix: '⚡',
		defaultChatMode: 'chat',
		openApiTools: [],
		cliTools: [],
		conversations: [],
		...overrides,
	} as PluginSettings;
}

describe('PluginDataService', () => {
	describe('initialize', () => {
		it('initializes without error when storage is empty', async () => {
			const { app } = makeApp();
			const svc = new PluginDataService(app);
			await expect(svc.initialize()).resolves.not.toThrow();
		});

		it('exposes tokenUsageRepo after initialize', async () => {
			const { app } = makeApp();
			const svc = new PluginDataService(app);
			await svc.initialize();
			expect(svc.tokenUsageRepo).toBeDefined();
		});
	});

	describe('hydrateAll', () => {
		it('returns empty result when repos are empty and settings have no data', async () => {
			const { app } = makeApp();
			const svc = new PluginDataService(app);
			await svc.initialize();
			const result = await svc.hydrateAll(makeSettings());
			expect(result).toEqual({});
		});

		it('saves settings llmConfigs to repo when repo is empty and settings has data', async () => {
			const { app, store } = makeApp();
			const svc = new PluginDataService(app);
			await svc.initialize();
			const settings = makeSettings({
				llmConfigs: [{ id: 'p1', provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' } as any],
			});
			await svc.hydrateAll(settings);
			// Repo should have been written (bidirectional sync: empty repo → save settings data)
			const providerKeys = Object.keys(store).filter(k => k.includes('provider'));
			expect(providerKeys.length).toBeGreaterThan(0);
		});

		it('returns loaded providers from repo when repo is non-empty', async () => {
			const { app } = makeApp();
			const svc = new PluginDataService(app);
			await svc.initialize();

			// Pre-populate via persistAll
			const settings = makeSettings({
				llmConfigs: [{ id: 'p1', provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' } as any],
			});
			await svc.persistAll(settings);

			// Now a second service on the same store should hydrate from repo
			const svc2 = new PluginDataService(app);
			await svc2.initialize();
			const result = await svc2.hydrateAll(makeSettings());
			expect(result.llmConfigs).toHaveLength(1);
			expect(result.llmConfigs![0].provider).toBe('openai');
		});
	});

	describe('persistAll', () => {
		it('writes all settings to repositories', async () => {
			const { app, store } = makeApp();
			const svc = new PluginDataService(app);
			await svc.initialize();
			const settings = makeSettings({
				systemPrompts: [{ id: 'sp1', name: 'Test', content: 'Be helpful', enabled: true } as any],
				activeSystemPromptId: 'sp1',
			});
			await svc.persistAll(settings);
			const promptKeys = Object.keys(store).filter(k => k.includes('prompt'));
			expect(promptKeys.length).toBeGreaterThan(0);
		});
	});
});
