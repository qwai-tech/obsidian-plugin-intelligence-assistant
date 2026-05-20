# main.ts Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `PluginDataService` (all repository init/hydrate/persist logic) and `EditorQuickActions` (editor menu AI actions) from main.ts, reducing it from 789 lines to ~480 lines.

**Architecture:** Two focused service classes replace inlined methods. `PluginDataService` owns the 7 data repositories and exposes `initialize()`, `hydrateAll()`, and `persistAll()`. `EditorQuickActions` owns the editor context-menu registration and AI streaming logic. main.ts becomes a thin orchestrator that wires services together.

**Tech Stack:** TypeScript, Obsidian Plugin API, Jest for unit tests.

---

## File Structure

**Create:**
- `src/application/services/plugin-data-service.ts` — owns all 7 repos; replaces `ensureDataRepositories`, `hydrateProvidersFromRepository`, `hydratePromptsFromRepository`, `hydrateAgentsFromRepository`, `hydrateModelCaches`, `hydrateMcpServersFromRepository`, `persistDataRepositories`, `persistMcpToolCaches`
- `src/presentation/editor/editor-quick-actions.ts` — owns editor menu registration and AI action execution; replaces `registerEditorMenuActions`, `addEditorQuickActions`, `handleEditorAIAction`
- `src/__tests__/application/plugin-data-service.test.ts`
- `src/__tests__/presentation/editor-quick-actions.test.ts`

**Modify:**
- `main.ts` — remove 8 repository methods (~163 lines) and 3 editor methods (~140 lines); wire the two new services

---

### Task 1: PluginDataService — test

**Files:**
- Create: `src/__tests__/application/plugin-data-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/__tests__/application/plugin-data-service.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../application/services/plugin-data-service'`

---

### Task 2: PluginDataService — implementation

**Files:**
- Create: `src/application/services/plugin-data-service.ts`

- [ ] **Step 3: Implement PluginDataService**

```typescript
// src/application/services/plugin-data-service.ts
import { App } from 'obsidian';
import type { PluginSettings, LLMConfig, SystemPrompt, Agent, MCPServerConfig } from '@/types';
import {
	AgentRepository,
	PromptRepository,
	ModelCacheRepository,
	ProviderRepository,
	McpServerRepository,
	McpToolCacheRepository,
} from '@/infrastructure/persistence';
import { TokenUsageRepository } from '@/infrastructure/persistence/data/token-usage-repository';

export interface HydrateResult {
	llmConfigs?: LLMConfig[];
	systemPrompts?: SystemPrompt[];
	activeSystemPromptId?: string | null;
	agents?: Agent[];
	activeAgentId?: string | null;
	mcpServers?: MCPServerConfig[];
}

export class PluginDataService {
	private promptRepository!: PromptRepository;
	private agentRepository!: AgentRepository;
	private modelCacheRepository!: ModelCacheRepository;
	private providerRepository!: ProviderRepository;
	private mcpServerRepository!: McpServerRepository;
	private mcpToolCacheRepository!: McpToolCacheRepository;
	public tokenUsageRepo!: TokenUsageRepository;

	constructor(private readonly app: App) {}

	async initialize(): Promise<void> {
		this.promptRepository = new PromptRepository(this.app);
		this.agentRepository = new AgentRepository(this.app);
		this.modelCacheRepository = new ModelCacheRepository(this.app);
		this.providerRepository = new ProviderRepository(this.app);
		this.mcpServerRepository = new McpServerRepository(this.app);
		this.mcpToolCacheRepository = new McpToolCacheRepository(this.app);
		this.tokenUsageRepo = new TokenUsageRepository(this.app);

		await Promise.all([
			this.promptRepository.initialize(),
			this.agentRepository.initialize(),
			this.modelCacheRepository.initialize(),
			this.providerRepository.initialize(),
			this.mcpServerRepository.initialize(),
			this.mcpToolCacheRepository.initialize(),
			this.tokenUsageRepo.initialize(),
		]);
	}

	/**
	 * Hydrate settings from repositories.
	 * - If a repo has data: returns it (repo is authoritative).
	 * - If a repo is empty but settings has data: saves settings to repo (first-time migration).
	 * Returns a partial settings object with only the fields that were loaded from repos.
	 */
	async hydrateAll(settings: PluginSettings): Promise<HydrateResult> {
		const result: HydrateResult = {};

		// Providers
		const providers = await this.providerRepository.loadAll();
		if (providers.length > 0) {
			result.llmConfigs = providers;
		} else if (settings.llmConfigs?.length) {
			await this.providerRepository.saveAll(settings.llmConfigs);
		}

		// Prompts
		const { prompts, activeId: promptActiveId } = await this.promptRepository.loadAll();
		if (prompts.length > 0) {
			result.systemPrompts = prompts;
			result.activeSystemPromptId = promptActiveId;
		} else if (settings.systemPrompts?.length) {
			await this.promptRepository.saveAll(settings.systemPrompts, settings.activeSystemPromptId ?? null);
		}

		// Agents
		const { agents, activeId: agentActiveId } = await this.agentRepository.loadAll();
		if (agents.length > 0) {
			result.agents = agents;
			result.activeAgentId = agentActiveId;
		} else if (settings.agents?.length) {
			await this.agentRepository.saveAll(settings.agents, settings.activeAgentId ?? null);
		}

		// Model cache (mutates configs in-place — no return value needed)
		await this.modelCacheRepository.applyCacheToConfigs(settings.llmConfigs ?? []);

		// MCP servers
		const mcpServers = await this.mcpServerRepository.loadAll();
		if (mcpServers.length > 0) {
			const cacheMap = await this.mcpToolCacheRepository.loadAll();
			for (const server of mcpServers) {
				const cache = cacheMap[server.name];
				if (cache) {
					server.cachedTools = cache.tools;
					server.cacheTimestamp = cache.updatedAt;
				}
			}
			result.mcpServers = mcpServers;
		} else if (settings.mcpServers?.length) {
			await this.mcpServerRepository.saveAll(settings.mcpServers);
			await this.persistMcpToolCaches(settings.mcpServers);
		}

		return result;
	}

	async persistAll(settings: PluginSettings): Promise<void> {
		await Promise.all([
			this.promptRepository.saveAll(settings.systemPrompts ?? [], settings.activeSystemPromptId ?? null),
			this.agentRepository.saveAll(settings.agents ?? [], settings.activeAgentId ?? null),
			this.modelCacheRepository.saveFromConfigs(settings.llmConfigs ?? []),
			this.providerRepository.saveAll(settings.llmConfigs ?? []),
			this.mcpServerRepository.saveAll(settings.mcpServers ?? []),
			this.persistMcpToolCaches(settings.mcpServers ?? []),
		]);
	}

	async persistMcpToolCaches(servers: MCPServerConfig[]): Promise<void> {
		await Promise.all(
			(servers ?? []).map(server =>
				this.mcpToolCacheRepository.save(server.name, server.cachedTools ?? [], server.cacheTimestamp)
			)
		);
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest src/__tests__/application/plugin-data-service.test.ts --no-coverage
```

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/application/services/plugin-data-service.ts src/__tests__/application/plugin-data-service.test.ts
git commit -m "feat: add PluginDataService to encapsulate repository init and hydration"
```

---

### Task 3: EditorQuickActions — test

**Files:**
- Create: `src/__tests__/presentation/editor-quick-actions.test.ts`

- [ ] **Step 6: Write failing test**

```typescript
// src/__tests__/presentation/editor-quick-actions.test.ts
import { EditorQuickActions } from '../../presentation/editor/editor-quick-actions';

// Mock obsidian
jest.mock('obsidian', () => ({
	Notice: jest.fn(),
}));

jest.mock('../../i18n', () => ({
	t: (key: string) => key,
}));

jest.mock('../../infrastructure/llm/model-manager', () => ({
	ModelManager: {
		findConfigForModelByProvider: jest.fn().mockReturnValue({
			provider: 'openai',
			apiKey: 'k',
			modelId: 'gpt-4o',
		}),
	},
}));

jest.mock('../../infrastructure/llm/provider-factory', () => ({
	ProviderFactory: {
		createProvider: jest.fn().mockReturnValue({
			streamChat: jest.fn(async (_req: unknown, onChunk: (c: { done: boolean; content?: string }) => void) => {
				onChunk({ done: false, content: 'hello' });
				onChunk({ done: true });
			}),
		}),
	},
}));

function makeConfig(overrides = {}) {
	return {
		quickActions: [
			{ id: 'summarize', name: 'Summarize', prompt: 'Summarize: ', actionType: 'replace' as const, enabled: true },
		],
		quickActionPrefix: '⚡',
		llmConfigs: [{ id: 'p1', provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' }] as any[],
		defaultModel: 'gpt-4o',
		...overrides,
	};
}

describe('EditorQuickActions', () => {
	describe('addMenuItems', () => {
		it('does not add items when selection is empty', () => {
			const app = {} as any;
			const qas = new EditorQuickActions(app, () => makeConfig());
			const menu = { addSeparator: jest.fn(), addItem: jest.fn() };
			const editor = { getSelection: jest.fn().mockReturnValue('') };
			(qas as any).addMenuItems(menu, editor, {});
			expect(menu.addSeparator).not.toHaveBeenCalled();
		});

		it('adds separator and one item when text is selected and action is enabled', () => {
			const app = {} as any;
			const qas = new EditorQuickActions(app, () => makeConfig());
			const menu = { addSeparator: jest.fn(), addItem: jest.fn() };
			const editor = { getSelection: jest.fn().mockReturnValue('some text') };
			(qas as any).addMenuItems(menu, editor, {});
			expect(menu.addSeparator).toHaveBeenCalledTimes(1);
			expect(menu.addItem).toHaveBeenCalledTimes(1);
		});

		it('adds no items when all actions are disabled', () => {
			const app = {} as any;
			const config = makeConfig({
				quickActions: [{ id: 'summarize', name: 'Summarize', prompt: 'Summarize: ', actionType: 'replace', enabled: false }],
			});
			const qas = new EditorQuickActions(app, () => config);
			const menu = { addSeparator: jest.fn(), addItem: jest.fn() };
			const editor = { getSelection: jest.fn().mockReturnValue('some text') };
			(qas as any).addMenuItems(menu, editor, {});
			expect(menu.addSeparator).not.toHaveBeenCalled();
		});
	});

	describe('executeAction — replace', () => {
		it('calls editor.replaceSelection with streamed result', async () => {
			const app = {} as any;
			const qas = new EditorQuickActions(app, () => makeConfig());
			const editor = { replaceSelection: jest.fn(), getSelection: jest.fn() };
			await (qas as any).executeAction(editor, 'selected', 'Summarize: ', 'replace', undefined);
			expect(editor.replaceSelection).toHaveBeenCalledWith('hello');
		});
	});
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npx jest src/__tests__/presentation/editor-quick-actions.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../presentation/editor/editor-quick-actions'`

---

### Task 4: EditorQuickActions — implementation

**Files:**
- Create: `src/presentation/editor/editor-quick-actions.ts`

- [ ] **Step 8: Create directory and implement**

```bash
mkdir -p src/presentation/editor
```

```typescript
// src/presentation/editor/editor-quick-actions.ts
import { App, Menu, Editor, MarkdownView, Notice } from 'obsidian';
import { t } from '@/i18n';
import { ExplainTextModal } from '@/presentation/components/modals/explain-text-modal';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import type { LLMConfig } from '@/types';
import type { QuickActionConfig } from '@/types/settings';

export interface EditorQuickActionsConfig {
	quickActions: QuickActionConfig[];
	quickActionPrefix: string;
	llmConfigs: LLMConfig[];
	defaultModel: string;
}

export class EditorQuickActions {
	constructor(
		private readonly app: App,
		private readonly getConfig: () => EditorQuickActionsConfig
	) {}

	register(plugin: { registerEvent: (e: unknown) => void; app: { workspace: App['workspace'] } }): void {
		plugin.registerEvent(
			plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				this.addMenuItems(menu, editor, view);
			})
		);
	}

	private addMenuItems(menu: Menu, editor: Editor, _view: MarkdownView): void {
		const selectedText = editor.getSelection();
		if (!selectedText || selectedText.trim().length === 0) return;

		const { quickActions, quickActionPrefix } = this.getConfig();
		const enabledActions = quickActions.filter(action => action.enabled);
		if (enabledActions.length === 0) return;

		const iconMap: Record<string, string> = {
			'make-longer': 'text-cursor-input',
			'summarize': 'list-collapse',
			'improve-writing': 'pencil',
			'fix-grammar': 'spellcheck',
			'explain': 'lightbulb',
		};

		menu.addSeparator();
		const prefix = quickActionPrefix || '⚡';

		for (const action of enabledActions) {
			menu.addItem((item) => {
				item
					.setTitle(prefix ? `${prefix} ${action.name}` : action.name)
					.setIcon(iconMap[action.id] || 'bot')
					.onClick(async () => {
						await this.executeAction(editor, selectedText, action.prompt, action.actionType, action.model);
					});
			});
		}
	}

	private async executeAction(
		editor: Editor,
		selectedText: string,
		promptPrefix: string,
		actionType: 'replace' | 'explain',
		customModel?: string
	): Promise<void> {
		const { llmConfigs, defaultModel } = this.getConfig();

		if (llmConfigs.length === 0) {
			new Notice(t('notices.noProvider'));
			return;
		}

		const modelId = customModel || defaultModel;
		if (!modelId) {
			new Notice(t('notices.noModel'));
			return;
		}

		const config = ModelManager.findConfigForModelByProvider(modelId, llmConfigs);
		if (!config) {
			new Notice(t('notices.noValidProvider', { modelId }));
			return;
		}

		const loadingNotice = new Notice(t('notices.processing'), 0);

		try {
			const provider = ProviderFactory.createProvider(config);
			const fullPrompt = promptPrefix + selectedText;

			let modal: ExplainTextModal | null = null;
			if (actionType === 'explain') {
				modal = new ExplainTextModal(this.app, 'Explanation');
				modal.open();
			}

			let result = '';
			await provider.streamChat(
				{ messages: [{ role: 'user', content: fullPrompt }], model: modelId, temperature: 0.7 },
				(chunk) => {
					if (!chunk.done && chunk.content) {
						result += chunk.content;
						if (modal) modal.updateContent(result);
					}
				}
			);

			loadingNotice.hide();

			if (actionType === 'replace') {
				editor.replaceSelection(result.trim());
				new Notice(t('notices.textUpdated'));
			} else if (actionType === 'explain' && !result) {
				modal?.showError('No explanation generated');
			}
		} catch (error) {
			loadingNotice.hide();
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(t('notices.error', { message: errorMsg }));
			console.error('[Editor AI Action] Error:', error);
		}
	}
}
```

- [ ] **Step 9: Run tests — expect pass**

```bash
npx jest src/__tests__/presentation/editor-quick-actions.test.ts --no-coverage
```

Expected: PASS (all 4 tests)

- [ ] **Step 10: Commit**

```bash
git add src/presentation/editor/editor-quick-actions.ts src/__tests__/presentation/editor-quick-actions.test.ts
git commit -m "feat: add EditorQuickActions to encapsulate editor menu AI actions"
```

---

### Task 5: Wire both services into main.ts

**Files:**
- Modify: `main.ts`

This task rewrites main.ts to use `PluginDataService` and `EditorQuickActions`. Read the current main.ts before editing.

- [ ] **Step 11: Add imports and new fields to main.ts**

Replace in the imports section (after the existing imports, before the re-exports):

```typescript
import { PluginDataService } from './src/application/services/plugin-data-service';
import { EditorQuickActions } from './src/presentation/editor/editor-quick-actions';
```

Remove these imports (they are now internal to PluginDataService):
```typescript
// Remove: AgentRepository, PromptRepository, ModelCacheRepository, ProviderRepository,
//          McpServerRepository, McpToolCacheRepository — they're still needed for the public
//          tokenUsageRepo property, so keep TokenUsageRepository import but remove the others
```

Actually, keep the repository imports removed from main.ts since they're now internal to PluginDataService. But keep TokenUsageRepository because `main.ts` exposes `public tokenUsageRepo` which is accessed from chat-view.ts.

Remove the 6 repository imports and replace them with the PluginDataService import:

```typescript
// REMOVE these 7 lines:
import { TokenUsageRepository } from './src/infrastructure/persistence/data/token-usage-repository';
import {
	AgentRepository,
	PromptRepository,
	ModelCacheRepository,
	ProviderRepository,
	McpServerRepository,
	McpToolCacheRepository
} from './src/infrastructure/persistence';

// ADD:
import { PluginDataService } from './src/application/services/plugin-data-service';
import { EditorQuickActions } from './src/presentation/editor/editor-quick-actions';
```

Keep `TokenUsageRepository` in type imports only for the public field type annotation:
```typescript
import type { TokenUsageRepository } from './src/infrastructure/persistence/data/token-usage-repository';
```

- [ ] **Step 12: Replace class fields**

In the class body, remove the 8 individual repository fields:

```typescript
// REMOVE these 8 lines:
private promptRepository: PromptRepository | null = null;
private agentRepository: AgentRepository | null = null;
private modelCacheRepository: ModelCacheRepository | null = null;
private providerRepository: ProviderRepository | null = null;
private mcpServerRepository: McpServerRepository | null = null;
private mcpToolCacheRepository: McpToolCacheRepository | null = null;
public tokenUsageRepo: TokenUsageRepository | null = null;
```

Add two new fields:

```typescript
private dataService!: PluginDataService;
private editorQuickActions!: EditorQuickActions;
public get tokenUsageRepo() { return this.dataService?.tokenUsageRepo ?? null; }
```

- [ ] **Step 13: Update onload() to initialize new services**

In `onload()`, before `await this.loadSettings()`, add:

```typescript
this.dataService = new PluginDataService(this.app);
await this.dataService.initialize();
this.editorQuickActions = new EditorQuickActions(this.app, () => ({
    quickActions: this.settings.quickActions,
    quickActionPrefix: this.settings.quickActionPrefix || '⚡',
    llmConfigs: this.settings.llmConfigs,
    defaultModel: this.settings.defaultModel,
}));
```

Replace `this.registerEditorMenuActions()` with:

```typescript
this.editorQuickActions.register(this);
```

- [ ] **Step 14: Rewrite loadSettings() to use dataService**

Replace the entire `loadSettings()` method body:

```typescript
async loadSettings() {
    const totalStart = Date.now();

    // dataService already initialized in onload() before this call
    console.debug(`[Settings] Repositories ready: ${Date.now() - totalStart}ms`);

    const configStart = Date.now();
    const userConfigExists = await this.userConfigExists();
    const userConfig = userConfigExists ? await this.readUserConfigFile() : null;
    let legacyConversations: Conversation[] = [];
    let legacyData: unknown = null;

    try {
        legacyData = await this.loadData();
    } catch (error) {
        console.debug('No legacy data found', error);
    }

    let storedSettings: PluginSettings | null = null;
    if (userConfig) {
        storedSettings = userConfigToPluginSettings(userConfig);
    } else if (legacyData && typeof legacyData === 'object') {
        storedSettings = legacyData as PluginSettings;
        const dataObj = legacyData as Record<string, unknown>;
        if (Array.isArray(dataObj.conversations)) {
            legacyConversations = dataObj.conversations as Conversation[];
        }
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings ?? {});
    this.legacyConversations = legacyConversations;
    console.debug(`[Settings] Read config files: ${Date.now() - configStart}ms`);

    const hydrateStart = Date.now();
    const hydrated = await this.dataService.hydrateAll(this.settings);
    Object.assign(this.settings, hydrated);
    console.debug(`[Settings] Hydrate all: ${Date.now() - hydrateStart}ms`);

    // Migrate old agents: modelId → modelStrategy
    let settingsMutated = false;
    for (const agent of this.settings.agents) {
        const agentWithOldModel = agent as Agent & { modelId?: string };
        if ('modelId' in agent && typeof agentWithOldModel.modelId === 'string') {
            agent.modelStrategy = { strategy: 'fixed', modelId: agentWithOldModel.modelId };
            delete agentWithOldModel.modelId;
            settingsMutated = true;
        }
        if (!agent.modelStrategy) {
            agent.modelStrategy = { strategy: 'default', modelId: this.settings.defaultModel || 'gpt-4o' };
            settingsMutated = true;
        }
    }

    if (!userConfig || settingsMutated) {
        await this.writeUserSettingsFile(this.settings);
    }

    console.debug(`[Settings] Total load time: ${Date.now() - totalStart}ms`);
}
```

- [ ] **Step 15: Rewrite saveSettings() to use dataService**

```typescript
async saveSettings() {
    await this.dataService.persistAll(this.settings);
    await this.writeUserSettingsFile(this.settings);
}
```

- [ ] **Step 16: Delete the 11 methods now owned by services**

Delete these methods entirely from main.ts:
- `ensureDataRepositories()` 
- `hydratePromptsFromRepository()`
- `hydrateAgentsFromRepository()`
- `hydrateModelCaches()`
- `hydrateMcpServersFromRepository()`
- `hydrateProvidersFromRepository()`
- `persistDataRepositories()`
- `persistMcpToolCaches()`
- `registerEditorMenuActions()`
- `addEditorQuickActions()`
- `handleEditorAIAction()`

- [ ] **Step 17: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✅ Build completed successfully`

Fix any TypeScript errors before continuing. Common issues:
- `tokenUsageRepo` type: change `public tokenUsageRepo: TokenUsageRepository | null = null` to the getter form shown above
- Any reference to deleted repository fields: these should now go through `this.dataService.tokenUsageRepo`

- [ ] **Step 18: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: All previously passing tests still pass. No new failures.

- [ ] **Step 19: Run lint**

```bash
npm run lint 2>&1 | grep "error" | grep -v "^/" | head -10
```

Expected: No new errors (pre-existing errors are OK).

- [ ] **Step 20: Commit**

```bash
git add main.ts
git commit -m "refactor: wire PluginDataService and EditorQuickActions into main.ts"
```

---

### Task 6: Deploy and verify

- [ ] **Step 21: Deploy to local Obsidian**

```bash
npm run build && node scripts/deploy.js --local
```

Expected: `✅ Plugin deployed successfully`

- [ ] **Step 22: Final check — line count**

```bash
wc -l main.ts
```

Expected: ~480 lines (down from 789).
