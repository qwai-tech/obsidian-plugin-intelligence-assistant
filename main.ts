import { Plugin, WorkspaceLeaf } from 'obsidian';
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
import { ToolManager } from './src/application/services/tool-manager';
import { OpenApiToolLoader } from './src/application/services/openapi-tool-loader';
import { CLIToolLoader } from './src/application/services/cli-tool-loader';
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
import { EditorQuickActions } from './src/presentation/editor/editor-quick-actions';
import { ToolRegistry } from './src/application/tools/tool-registry';
import { BuiltinToolSource } from './src/application/tools/sources/builtin-tool-source';
import { McpToolSource } from './src/application/tools/sources/mcp-tool-source';
import { OpenApiToolSource } from './src/application/tools/sources/openapi-tool-source';
import { CliToolSource } from './src/application/tools/sources/cli-tool-source';
import { migrateAllAgents } from './src/application/tools/tool-migrations';

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

// Re-export from MCP service for backward compatibility
export { snapshotMcpTools } from './src/application/services/mcp-service';

// ToolConfig for ToolManager
export interface ToolConfig {
	type: string;
	enabled: boolean;
}

interface OpenApiReloadOptions {
	forceRefetch?: boolean;
	persistCacheMetadata?: boolean;
}

export default class IntelligenceAssistantPlugin extends Plugin {
	settings: PluginSettings;
	
	// Architecture components
	private conversationStorageService: ConversationStorageService | null = null;
	private conversationMigrationService: ConversationMigrationService | null = null;
	private sharedToolManager: ToolManager | null = null;
	private sharedToolRegistry: ToolRegistry | null = null;
	private openApiToolLoader: OpenApiToolLoader | null = null;
	private cliToolLoader: CLIToolLoader | null = null;
	private pluginDataPath = '';
	private chatRibbonIconEl: HTMLElement | null = null;
	private legacyConversations: Conversation[] = [];
	private dataService!: PluginDataService;
	private editorQuickActions!: EditorQuickActions;
	public get tokenUsageRepo() { return this.dataService?.tokenUsageRepo ?? null; }
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

			// Run these in parallel for faster completion
			await Promise.all([
				this.migrateConversationsIfNeeded().catch(error =>
					console.error('[Plugin] Conversation migration failed:', error)
				),
				this.ensureDefaultAgent().catch(error =>
					console.error('[Plugin] Ensure default agent failed:', error)
				),
				this.ensureAutoConnectedMcpServers().catch(error =>
					console.error('[Plugin] MCP auto-connect failed:', error)
				),
				this.reloadOpenApiTools().catch(error =>
					console.error('[Plugin] OpenAPI tools load failed:', error)
				),
				Promise.resolve().then(() => this.reloadCLITools()).catch(error =>
					console.error('[Plugin] CLI tools load failed:', error)
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
		// Clean up tool manager (don't detach leaves to preserve user layout)
		if (this.sharedToolManager) {
			this.sharedToolManager.cleanup().catch(error => console.error('[MCP] Cleanup failed', error));
			this.sharedToolManager = null;
		}
		if (this.sharedToolRegistry) {
			this.sharedToolRegistry.dispose().catch(error =>
				console.error('[Plugin] ToolRegistry dispose failed:', error)
			);
			this.sharedToolRegistry = null;
		}
		this.openApiToolLoader = null;
		this.cliToolLoader = null;
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

	public getToolManager(): ToolManager {
		if (!this.sharedToolManager) {
			this.sharedToolManager = new ToolManager(this.app, this.settings.builtInTools);
		}
		return this.sharedToolManager;
	}

	public getToolRegistry(): ToolRegistry {
		if (!this.sharedToolRegistry) {
			this.sharedToolRegistry = new ToolRegistry();
		}
		return this.sharedToolRegistry;
	}

	private getOpenApiLoader(): OpenApiToolLoader {
		if (!this.openApiToolLoader) {
			this.openApiToolLoader = new OpenApiToolLoader(new ObsidianFileSystem(this.app), this.getToolManager(), this.pluginDataPath);
		}
		return this.openApiToolLoader;
	}

	public syncToolManagerConfig() {
		if (this.sharedToolManager) {
			this.sharedToolManager.setToolConfigs(this.settings.builtInTools);
		}
	}

	/**
	 * Initialize the ToolRegistry from current settings.
	 * Creates sources for every enabled config entry and reloads.
	 */
	public async initToolRegistry(): Promise<void> {
		const registry = this.getToolRegistry();

		// Builtin: always register
		registry.registerSource(new BuiltinToolSource(this.app));

		// MCP servers: one source per enabled server
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
		console.debug('[Plugin] ToolRegistry initialized');
	}

	public async reloadOpenApiTools(options?: OpenApiReloadOptions): Promise<Map<string, number>> {
		const loader = this.getOpenApiLoader();
		return await loader.reloadAll(this.settings.openApiTools ?? [], options);
	}

	public async reloadOpenApiConfig(configId: string, options?: OpenApiReloadOptions): Promise<number> {
		const loader = this.getOpenApiLoader();
		const config = this.settings.openApiTools?.find(tool => tool.id === configId);
		if (!config) {
			return 0;
		}
		return await loader.reloadConfig(config, options);
	}

	public async removeOpenApiConfig(configId: string): Promise<void> {
		const loader = this.getOpenApiLoader();
		await loader.removeConfig(configId);
	}

	private getCLIToolLoader(): CLIToolLoader {
		if (!this.cliToolLoader) {
			this.cliToolLoader = new CLIToolLoader(this.getToolManager());
		}
		return this.cliToolLoader;
	}

	public reloadCLITools(): void {
		const loader = this.getCLIToolLoader();
		loader.loadAll(this.settings.cliTools ?? []);
	}

	public hasEnabledOpenApiTools(): boolean {
		return (this.settings.openApiTools ?? []).some(config => config.enabled);
	}

	public async ensureAutoConnectedMcpServers(): Promise<boolean> {
		const { ensureAutoConnectedMcpServers: initMCP } = await import('./src/application/services/mcp-service');
		return await initMCP(
			this.settings.mcpServers,
			this.getToolManager(),
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

	async openChatViewInMainArea() {
		// Try to find an existing chat view in the main area (root split)
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		const mainLeaf = existing.find(leaf => leaf.getRoot() === this.app.workspace.rootSplit);
		if (mainLeaf) {
			await this.app.workspace.revealLeaf(mainLeaf);
			return;
		}

		// Create a new tab in the main editor area
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async openChatViewInRightSidebar() {
		// Try to find an existing chat view
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length > 0) {
			// If exists, just show it
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// Create a new leaf in the right sidebar
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			// Focus on the new view
			await this.app.workspace.revealLeaf(leaf);
		} else {
			// Fallback: create in any available leaf
			const newLeaf = this.app.workspace.getLeaf(true);
			await newLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		}
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

		// Phase 3: migrate legacy tool fields to toolAccess
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
