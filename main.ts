import { Editor, MarkdownView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import './src/presentation/components/chat/settings.css';
import './src/presentation/components/modals/explain-text-modal.css';
import type {
	PluginSettings,
	MCPServerConfig,
	CachedMCPTool,
	SystemPrompt,
	Agent,
	LLMConfig,
	ModelCapability,
	ModelInfo,
	RAGConfig,
	WebSearchConfig,
	Conversation,
	ConversationSummary,
	AgentMemory,
	MemoryEmbedding,
	MemoryEmbeddingMetadata,
	BuiltInToolConfig,
	MCPRegistry,
	Message,
	UserConfig
} from './src/types';
import { DEFAULT_SETTINGS, pluginSettingsToUserConfig, userConfigToPluginSettings } from './src/types';
import { ChatView, CHAT_VIEW_TYPE } from './src/presentation/views/chat-view';
import { IntelligenceAssistantSettingTab } from './src/presentation/components/settings-tab';
import {
	USER_CONFIG_FOLDER,
	USER_CONFIG_PATH
} from './src/constants';

import { ensureDefaultAgent as ensureDefaultAgentService } from './src/application/services/agent-service';
import { ConversationStorageService } from './src/application/services/conversation-storage-service';
import { ConversationMigrationService } from './src/application/services/conversation-migration-service';
import { RAGManager } from './src/infrastructure/rag-manager';
import { SettingsService } from './src/application/services/settings-service';

import { initI18n } from './src/i18n';
import { ObsidianFileSystem } from './src/infrastructure/obsidian/obsidian-file-system';
import { PluginDataService } from './src/application/services/plugin-data-service';
import type { AgentMemoryRepository } from './src/infrastructure/persistence';
import { EditorQuickActions } from './src/presentation/editor/editor-quick-actions';
import { TextInputModal } from './src/presentation/components/modals/text-input-modal';
import { ToolRegistry } from './src/application/tools/tool-registry';
import { BuiltinToolSource } from './src/application/tools/sources/builtin-tool-source';
import { McpToolSource } from './src/application/tools/sources/mcp-tool-source';
import { OpenApiToolSource } from './src/application/tools/sources/openapi-tool-source';
import { CliToolSource } from './src/application/tools/sources/cli-tool-source';
import { migrateAllAgents } from './src/application/tools/tool-migrations';
import {
	buildAskCurrentNotePrompt,
	buildImproveSelectionPrompt,
	buildOrganizeCurrentNotePrompt,
	buildOrganizeFolderPrompt,
	buildSummarizeCurrentNotePrompt,
	buildSummarizeFilePrompt,
} from './src/application/services/obsidian-agent-prompts';
import {
	appendObsidianContextSnapshot,
	buildObsidianContextSnapshot,
} from './src/application/services/obsidian-context-builder';

// Re-export for backward compatibility
export type {
	MCPServerConfig,
	SystemPrompt,
	Agent,
	LLMConfig,
	ModelCapability,
	ModelInfo,
	RAGConfig,
	WebSearchConfig,
	Conversation,
	ConversationSummary,
	AgentMemory,
	MemoryEmbedding,
	MemoryEmbeddingMetadata,
	BuiltInToolConfig,
	MCPRegistry,
	Message,
	CachedMCPTool
};

// Re-export the snapshot helper (used by some legacy tests/UI imports of @plugin).
export { snapshotMcpTools } from './src/application/tools/mcp-helpers';

interface OpenApiReloadOptions {
	forceRefetch?: boolean;
	persistCacheMetadata?: boolean;
}

export default class IntelligenceAssistantPlugin extends Plugin {
	settings: PluginSettings;
	
	// Architecture components
	private conversationStorageService: ConversationStorageService | null = null;
	private conversationMigrationService: ConversationMigrationService | null = null;
	private sharedToolRegistry: ToolRegistry | null = null;
	private pluginDataPath = '';
	private chatRibbonIconEl: HTMLElement | null = null;
	private legacyConversations: Conversation[] = [];
	private dataService!: PluginDataService;
	private editorQuickActions!: EditorQuickActions;
	public get tokenUsageRepo() { return this.dataService?.tokenUsageRepo ?? null; }
	public getAgentMemoryRepository(): AgentMemoryRepository | null { return this.dataService?.agentMemoryRepo ?? null; }
	private _ragManager: RAGManager | null = null;
	public settingsService!: SettingsService;

	async onload() {
		const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		initI18n(undefined, pluginDir);
		const loadStart = Date.now();

		// ── UI registration: must complete even if data loading fails ──

		// Register the chat view
		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new ChatView(leaf, this)
		);

		// Add command to open chat in right sidebar
		this.addCommand({
			id: "open-chat-sidebar",
			name: "Open AI chat in sidebar",
			callback: async () => {
				await this.openChatViewInRightSidebar();
			}
		});

		// Add command to open chat in main editor area
		this.addCommand({
			id: "open-chat-main",
			name: "Open AI chat in main area",
			callback: async () => {
				await this.openChatViewInMainArea();
			}
		});

		this.registerObsidianAgentEntryPoints();

		// Add ribbon icon for quick chat access
		this.chatRibbonIconEl = this.addRibbonIcon("message-circle", "Open AI chat", async () => {
			await this.openChatViewInRightSidebar();
		});
		this.chatRibbonIconEl?.addClass("ia-ribbon-chat-icon");

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new IntelligenceAssistantSettingTab(this.app, this));

		// ── Data initialization: wrapped so failures never break the UI ──

		try {
			this.settingsService = new SettingsService(
				() => this.settings,
				() => this.saveSettings()
			);

			this.pluginDataPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/data`;
			await this.ensureFolderExists(this.pluginDataPath);

			this.conversationStorageService = new ConversationStorageService(this.app);
			await this.conversationStorageService.initialize();

			this.dataService = new PluginDataService(this.app);
			await this.dataService.initialize();
			this.editorQuickActions = new EditorQuickActions(this.app, () => ({
				quickActions: this.settings.quickActions,
				quickActionPrefix: this.settings.quickActionPrefix || "⚡",
				llmConfigs: this.settings.llmConfigs,
				defaultModel: this.settings.defaultModel,
			}));

			await this.loadSettings();

			// Register editor context menu actions
			this.editorQuickActions.register(this);
		} catch (error) {
			console.error("[Plugin] Data initialization failed:", error);
		}

		// Defer non-critical initialization to background
		void this.deferredInitialization();

		const loadTime = Date.now() - loadStart;
		console.debug(`[Plugin] Load time: ${loadTime}ms`);
	}

	/**
	 * Deferred initialization for non-critical features
	 * Runs in background without blocking plugin startup
	 */
	private async deferredInitialization(): Promise<void> {
		try {
			const deferredStart = Date.now();
			console.debug('[Plugin] Starting deferred initialization...');

			// Run these in parallel for faster completion. initToolRegistry()
			// now handles both source loading AND MCP cachedTools writeback,
			// so the separate ensureAutoConnectedMcpServers call that used to
			// live here is gone — it only runs on user-driven add/edit from
			// mcp-tab now.
			await Promise.all([
				this.migrateConversationsIfNeeded().catch(error =>
					console.error('[Plugin] Conversation migration failed:', error)
				),
				this.ensureDefaultAgent().catch(error =>
					console.error('[Plugin] Ensure default agent failed:', error)
				),
				this.initToolRegistry().catch(error =>
					console.error('[Plugin] ToolRegistry init failed:', error)
				),
			]);

			const deferredTime = Date.now() - deferredStart;
			console.debug(`[Plugin] Deferred initialization complete (${deferredTime}ms)`);
		} catch (error) {
			console.error('[Plugin] Deferred initialization error:', error);
		}
	}

		onunload() {
		// Don't detach leaves on unload — preserves the user's open chat tabs.
		if (this.sharedToolRegistry) {
			this.sharedToolRegistry.dispose().catch(error =>
				console.error('[Plugin] ToolRegistry dispose failed:', error)
			);
			this.sharedToolRegistry = null;
		}
		this.chatRibbonIconEl = null;
	}


	public getRAGManager(): RAGManager {
		if (!this._ragManager) {
			this._ragManager = new RAGManager(
				this.app,
				this.settings.ragConfig,
				this.settings.llmConfigs
			);
		}
		return this._ragManager;
	}

	public getToolRegistry(): ToolRegistry {
		if (!this.sharedToolRegistry) {
			this.sharedToolRegistry = new ToolRegistry();
		}
		return this.sharedToolRegistry;
	}

	/**
	 * Initialize the ToolRegistry from current settings.
	 * Creates sources for every enabled config entry and reloads.
	 */
	public async initToolRegistry(): Promise<void> {
		const registry = this.getToolRegistry();

		// Builtin: always register, gated by per-tool enabled flags.
		// The callback runs on every load() so toggling a builtin tool in
		// settings and calling reloadBuiltinTools picks up the change.
		registry.registerSource(new BuiltinToolSource(this.app, () =>
			(this.settings.builtInTools ?? [])
				.filter((t) => t.enabled)
				.map((t) => t.type),
		));

		// MCP servers: register every enabled server. Auto-mode servers are
		// loaded eagerly (the registry's reload below) and their cachedTools
		// gets written back here in one pass. Manual-mode servers are
		// registered but their load is deferred to user-triggered "connect".
		for (const server of (this.settings.mcpServers ?? [])) {
			if (server.enabled) {
				registry.registerSource(new McpToolSource(server));
			}
		}

		// OpenAPI: one source per enabled config
		const fs = new ObsidianFileSystem(this.app);
		for (const config of (this.settings.openApiTools ?? [])) {
			if (config.enabled) {
				registry.registerSource(
					new OpenApiToolSource(config, fs, this.pluginDataPath),
				);
			}
		}

		// CLI: one source per enabled config
		for (const config of (this.settings.cliTools ?? [])) {
			if (config.enabled) {
				registry.registerSource(new CliToolSource(config));
			}
		}

		await registry.reload();

		// MCP cache writeback: now that the registry has loaded what it can,
		// snapshot each enabled MCP server's live tools into its cachedTools
		// so the disconnected UI shows up-to-date state on next launch.
		const { snapshotMcpTools } = await import('./src/application/tools/mcp-helpers');
		let mcpCacheDirty = false;
		for (const server of (this.settings.mcpServers ?? [])) {
			if (!server.enabled) continue;
			const serverTools = registry.getTools().filter(
				(t) => t.origin.kind === 'mcp' && t.origin.sourceId === server.name,
			);
			if (serverTools.length > 0) {
				const fresh = snapshotMcpTools(serverTools);
				server.cachedTools = fresh;
				server.cacheTimestamp = Date.now();
				mcpCacheDirty = true;
			}
		}
		if (mcpCacheDirty) {
			await this.saveSettings();
		}

		console.debug('[Plugin] ToolRegistry initialized');
	}

	/** Reload every enabled OpenAPI spec into the registry, returning per-id tool counts. */
	public async reloadOpenApiTools(_options?: OpenApiReloadOptions): Promise<Map<string, number>> {
		const registry = this.getToolRegistry();
		const fs = new ObsidianFileSystem(this.app);
		const results = new Map<string, number>();
		const seenIds = new Set<string>();

		for (const config of this.settings.openApiTools ?? []) {
			if (!config.id) continue;
			seenIds.add(config.id);
			await registry.unregisterSource('openapi', config.id);
			if (!config.enabled) {
				results.set(config.id, 0);
				continue;
			}
			registry.registerSource(new OpenApiToolSource(config, fs, this.pluginDataPath));
			try {
				const tools = await registry.reloadSource('openapi', config.id);
				results.set(config.id, tools.length);
			} catch (err) {
				console.error(`[OpenAPI] reload failed for ${config.id}:`, err);
				results.set(config.id, 0);
			}
		}

		// Drop any registered openapi source whose config has been removed.
		for (const tool of registry.getTools()) {
			if (tool.origin.kind === 'openapi' && !seenIds.has(tool.origin.sourceId)) {
				await registry.unregisterSource('openapi', tool.origin.sourceId);
			}
		}
		return results;
	}

	/** Reload a single OpenAPI config; returns the number of tools it produced. */
	public async reloadOpenApiConfig(configId: string, _options?: OpenApiReloadOptions): Promise<number> {
		const config = this.settings.openApiTools?.find(tool => tool.id === configId);
		if (!config) return 0;

		const registry = this.getToolRegistry();
		await registry.unregisterSource('openapi', configId);
		if (!config.enabled) return 0;

		const fs = new ObsidianFileSystem(this.app);
		registry.registerSource(new OpenApiToolSource(config, fs, this.pluginDataPath));
		try {
			const tools = await registry.reloadSource('openapi', configId);
			return tools.length;
		} catch (err) {
			console.error(`[OpenAPI] reload failed for ${configId}:`, err);
			return 0;
		}
	}

	/** Remove an OpenAPI config's source from the registry. */
	public async removeOpenApiConfig(configId: string): Promise<void> {
		await this.getToolRegistry().unregisterSource('openapi', configId);
	}

	/** Refresh the builtin source after settings.builtInTools[].enabled changed. */
	public async reloadBuiltinTools(): Promise<void> {
		const registry = this.getToolRegistry();
		if (registry.hasSource('builtin', 'builtin')) {
			await registry.reloadSource('builtin', 'builtin');
		}
	}

	/**
	 * Refresh CLI sources in the registry from settings. Returns a Promise
	 * so the caller (cli-tools-section) can await before re-rendering;
	 * the registry's own mutex also serializes concurrent calls.
	 */
	public async reloadCLITools(): Promise<void> {
		const registry = this.getToolRegistry();
		// Snapshot current cli source ids so we can unregister stale ones.
		const liveCliIds = new Set<string>(
			registry.getTools()
				.filter((t) => t.origin.kind === 'cli')
				.map((t) => t.origin.sourceId),
		);
		for (const id of liveCliIds) {
			await registry.unregisterSource('cli', id);
		}
		for (const config of this.settings.cliTools ?? []) {
			if (!config.enabled) continue;
			registry.registerSource(new CliToolSource(config));
			try {
				await registry.reloadSource('cli', config.id);
			} catch (err) {
				console.error(`[CLI] reload failed for ${config.id}:`, err);
			}
		}
	}

	public async ensureAutoConnectedMcpServers(): Promise<boolean> {
		const { ensureAutoConnectedMcpServers: initMCP } = await import('./src/application/tools/mcp-helpers');
		return await initMCP(
			this.settings.mcpServers,
			this.getToolRegistry(),
			async () => await this.saveSettings()
		);
	}

	public async ensureDefaultAgent(): Promise<void> {
		await ensureDefaultAgentService(this.settings, async () => await this.saveSettings());
	}

	public async refreshChatViewsModels(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ChatView) {
				await view.refreshModels();
			}
		}
	}

	async openChatViewInMainArea(): Promise<ChatView | null> {
		// Try to find an existing chat view in the main area (root split)
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		const mainLeaf = existing.find(leaf => leaf.getRoot() === this.app.workspace.rootSplit);
		if (mainLeaf) {
			await this.app.workspace.revealLeaf(mainLeaf);
			return this.asChatView(mainLeaf);
		}

		// Create a new tab in the main editor area
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
		return this.asChatView(leaf);
	}

	async openChatViewInRightSidebar(): Promise<ChatView | null> {
		// Try to find an existing chat view
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length > 0) {
			// If exists, just show it
			await this.app.workspace.revealLeaf(existing[0]);
			return this.asChatView(existing[0]);
		}

		// Create a new leaf in the right sidebar
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			// Focus on the new view
			await this.app.workspace.revealLeaf(leaf);
			return this.asChatView(leaf);
		} else {
			// Fallback: create in any available leaf
			const newLeaf = this.app.workspace.getLeaf(true);
			await newLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			return this.asChatView(newLeaf);
		}
	}

	private asChatView(leaf: WorkspaceLeaf | null | undefined): ChatView | null {
		return leaf?.view instanceof ChatView ? leaf.view : null;
	}

	private async openAgentTask(prompt: string, references: Array<TFile | TFolder> = []): Promise<void> {
		const view = await this.openChatViewInRightSidebar();
		if (!view) {
			new Notice('Unable to open Intelligence Assistant chat view.');
			return;
		}

		let enrichedPrompt = prompt;
		if (references.length > 0) {
			try {
				const snapshot = await buildObsidianContextSnapshot(this.app, references);
				enrichedPrompt = appendObsidianContextSnapshot(prompt, snapshot);
			} catch (error) {
				console.warn('[ObsidianAgent] Failed to build context snapshot:', error);
			}
		}

		await view.startAgentTask({ prompt: enrichedPrompt, references });
	}

	private getActiveMarkdownFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		return file instanceof TFile ? file : null;
	}

	private registerObsidianAgentEntryPoints(): void {
		this.addCommand({
			id: 'ask-agent-current-note',
			name: 'Ask Agent about current note',
			callback: () => {
				const file = this.getActiveMarkdownFile();
				if (!file) {
					new Notice('Open a note before asking the Agent.');
					return;
				}
				new TextInputModal(
					this.app,
					'Ask Agent about current note',
					'What do you want to know?',
					'What should I understand or do next?',
					(question) => {
						void this.openAgentTask(buildAskCurrentNotePrompt(file.path, question), [file]);
					}
				).open();
			}
		});

		this.addCommand({
			id: 'summarize-current-note-agent',
			name: 'Summarize current note with Agent',
			callback: async () => {
				const file = this.getActiveMarkdownFile();
				if (!file) {
					new Notice('Open a note before summarizing with the Agent.');
					return;
				}
				await this.openAgentTask(buildSummarizeCurrentNotePrompt(file.path), [file]);
			}
		});

		this.addCommand({
			id: 'organize-current-note-agent',
			name: 'Organize current note with Agent',
			callback: async () => {
				const file = this.getActiveMarkdownFile();
				if (!file) {
					new Notice('Open a note before organizing with the Agent.');
					return;
				}
				await this.openAgentTask(buildOrganizeCurrentNotePrompt(file.path), [file]);
			}
		});

		this.addCommand({
			id: 'improve-selection-agent',
			name: 'Improve selection with Agent',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (!selection.trim()) {
					new Notice('Select text before asking the Agent to improve it.');
					return;
				}
				const file = view.file ?? this.getActiveMarkdownFile();
				await this.openAgentTask(
					buildImproveSelectionPrompt(selection, file?.path),
					file ? [file] : []
				);
			}
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile) {
					menu.addSeparator();
					menu.addItem(item => item
						.setTitle('Ask Agent about this file')
						.setIcon('bot')
						.onClick(() => {
							new TextInputModal(
								this.app,
								'Ask Agent about file',
								'What do you want to know?',
								'What should I understand or do next?',
								(question) => {
									void this.openAgentTask(buildAskCurrentNotePrompt(file.path, question), [file]);
								}
							).open();
						}));
					menu.addItem(item => item
						.setTitle('Summarize with Agent')
						.setIcon('list-collapse')
						.onClick(() => {
							void this.openAgentTask(buildSummarizeFilePrompt(file.path), [file]);
						}));
					return;
				}

				if (file instanceof TFolder) {
					menu.addSeparator();
					menu.addItem(item => item
						.setTitle('Organize folder with Agent')
						.setIcon('folder-tree')
						.onClick(() => {
							void this.openAgentTask(buildOrganizeFolderPrompt(file.path), [file]);
						}));
				}
			})
		);
	}

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

		// Migrate legacy per-source enable lists into toolAccess. This handles
		// agents loaded via `agentRepository.loadAll()` (the dominant path
		// once a user has saved agents to data/agents/*.json) — those bypass
		// `userConfigToPluginSettings`'s Stage A migration entirely.
		// The function is idempotent, so re-running on already-migrated agents
		// is a no-op.
		const cliIds = (this.settings.cliTools ?? []).map((c) => c.id);
		const agentChanged = migrateAllAgents(this.settings.agents, cliIds);
		if (agentChanged.size > 0) {
			settingsMutated = true;
			console.debug(`[Settings] Migrated toolAccess for ${agentChanged.size} agent(s)`);
		}

		if (!userConfig || settingsMutated) {
			await this.writeUserSettingsFile(this.settings);
		}

		console.debug(`[Settings] Total load time: ${Date.now() - totalStart}ms`);
	}

	async saveSettings() {
		await this.dataService.persistAll(this.settings);
		await this.writeUserSettingsFile(this.settings);
	}

	private async readUserConfigFile(): Promise<UserConfig | null> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(USER_CONFIG_PATH))) {
			return null;
		}
		try {
			const raw = await adapter.read(USER_CONFIG_PATH);
			return JSON.parse(raw) as UserConfig;
		} catch (error) {
			console.error('Failed to read user config:', error);
			return null;
		}
	}

	private async writeUserSettingsFile(settings: PluginSettings): Promise<void> {
		await this.ensureFolderExists(USER_CONFIG_FOLDER);
		const payload = pluginSettingsToUserConfig(settings);
		await this.app.vault.adapter.write(USER_CONFIG_PATH, JSON.stringify(payload, null, 2));
	}

	private async userConfigExists(): Promise<boolean> {
		return await this.app.vault.adapter.exists(USER_CONFIG_PATH);
	}

	private async ensureFolderExists(folder: string): Promise<void> {
		if (await this.app.vault.adapter.exists(folder)) {
			return;
		}

		const segments = folder.split('/');
		let current = '';
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private async migrateConversationsIfNeeded() {
		if (!this.conversationStorageService) {
			console.error('Conversation storage service not initialized');
			return;
		}

		this.conversationMigrationService = new ConversationMigrationService(this.conversationStorageService);
		
		const needsMigration = await this.conversationMigrationService.isMigrationNeeded();
		const legacyConversations = this.legacyConversations ?? [];
		
		if (needsMigration && legacyConversations.length > 0) {
			console.debug('Starting conversation migration...');
			
			const success = await this.conversationMigrationService.migrateFromOldFormat(legacyConversations);
			
			if (success) {
				console.debug('Conversation migration completed successfully');
				this.legacyConversations = [];
				this.settings.conversations = [];
				await this.saveSettings();
			} else {
				console.error('Conversation migration failed');
			}
		}
	}

	public async getConversationStorageService(): Promise<ConversationStorageService> {
		if (!this.conversationStorageService) {
			this.conversationStorageService = new ConversationStorageService(this.app);
			await this.conversationStorageService.initialize();
		}
		return this.conversationStorageService;
	}

}
