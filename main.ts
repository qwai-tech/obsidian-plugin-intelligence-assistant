import { Menu, Plugin, WorkspaceLeaf, Editor, MarkdownView, Notice } from 'obsidian';
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
import { ProviderFactory } from './src/infrastructure/llm/provider-factory';
import { ModelManager } from './src/infrastructure/llm/model-manager';
import { ExplainTextModal } from './src/presentation/components/modals/explain-text-modal';
import {
	USER_CONFIG_FOLDER,
	USER_CONFIG_PATH
} from './src/constants';

import { ensureDefaultAgent as ensureDefaultAgentService } from './src/application/services/agent-service';
import { ConversationStorageService } from './src/application/services/conversation-storage-service';
import { ConversationMigrationService } from './src/application/services/conversation-migration-service';

// Import architecture components
import { container } from './src/core/container';
import { MessageRepository } from './src/infrastructure/persistence/obsidian/message-repository';
import { ConversationRepository } from './src/infrastructure/persistence/obsidian/conversation-repository';
import {
	AgentRepository,
	PromptRepository,
	ModelCacheRepository,
	ProviderRepository,
	McpServerRepository,
	McpToolCacheRepository
} from './src/infrastructure/persistence';

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
	private openApiToolLoader: OpenApiToolLoader | null = null;
	private cliToolLoader: CLIToolLoader | null = null;
	private pluginDataPath = '';
	private chatRibbonIconEl: HTMLElement | null = null;
	private legacyConversations: Conversation[] = [];
	private promptRepository: PromptRepository | null = null;
	private agentRepository: AgentRepository | null = null;
	private modelCacheRepository: ModelCacheRepository | null = null;
	private providerRepository: ProviderRepository | null = null;
	private mcpServerRepository: McpServerRepository | null = null;
	private mcpToolCacheRepository: McpToolCacheRepository | null = null;

	async onload() {
		const loadStart = Date.now();

		// Initialize architecture components using dependency injection
		this.initializeArchitecture();

		this.pluginDataPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/data`;
		await this.ensureFolderExists(this.pluginDataPath);

		// Initialize conversation storage system first
		this.conversationStorageService = new ConversationStorageService(this.app);
		await this.conversationStorageService.initialize();

		await this.loadSettings();

		// Defer non-critical initialization to background (don't block startup)
		// These will run asynchronously after the plugin has loaded
		void this.deferredInitialization();

		// Register the chat view
		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new ChatView(leaf, this)
		);

		// Add command to open chat in right sidebar
		this.addCommand({
			id: 'open-chat-sidebar',
			name: 'Open AI chat in sidebar',
			callback: async () => {
				await this.openChatViewInRightSidebar();
			}
		});

		// Add ribbon icon for quick chat access
		this.chatRibbonIconEl = this.addRibbonIcon('message-circle', 'Open AI chat', async () => {
			await this.openChatViewInRightSidebar();
		});
		this.chatRibbonIconEl?.addClass('ia-ribbon-chat-icon');

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new IntelligenceAssistantSettingTab(this.app, this));

		// Register editor context menu actions
		this.registerEditorMenuActions();

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
				)
			]);

			const deferredTime = Date.now() - deferredStart;
			console.debug(`[Plugin] Deferred initialization complete (${deferredTime}ms)`);
		} catch (error) {
			console.error('[Plugin] Deferred initialization error:', error);
		}
	}

		onunload() {
		// Cleanup architecture components
		this.cleanupArchitecture();

		// Clean up tool manager (don't detach leaves to preserve user layout)
		if (this.sharedToolManager) {
			this.sharedToolManager.cleanup().catch(error => console.error('[MCP] Cleanup failed', error));
			this.sharedToolManager = null;
		}
		this.openApiToolLoader = null;
		this.cliToolLoader = null;
		this.chatRibbonIconEl = null;
	}

	private initializeArchitecture(): void {
		// Register services with the container
		container.register('MessageRepository', () => new MessageRepository(this.app.vault));
		container.register('ConversationRepository', () => new ConversationRepository(this.app.vault));
		// ChatService registration is commented out as it requires proper LLM provider and event bus setup
		// container.register('ChatService', () => {
		// 	const messageRepo = container.get<MessageRepository>('MessageRepository');
		// 	const conversationRepo = container.get<ConversationRepository>('ConversationRepository');
		// 	return new ChatService(messageRepo, conversationRepo, llmProvider, eventBus);
		// });
	}

	private cleanupArchitecture(): void {
		// Cleanup registered services
		// await serviceRegistry.cleanupAll();
	}

	public getToolManager(): ToolManager {
		if (!this.sharedToolManager) {
			this.sharedToolManager = new ToolManager(this.app, this.settings.builtInTools);
		}
		return this.sharedToolManager;
	}

	private getOpenApiLoader(): OpenApiToolLoader {
		if (!this.openApiToolLoader) {
			this.openApiToolLoader = new OpenApiToolLoader(this.app, this.getToolManager(), this.pluginDataPath);
		}
		return this.openApiToolLoader;
	}

	public syncToolManagerConfig() {
		if (this.sharedToolManager) {
			this.sharedToolManager.setToolConfigs(this.settings.builtInTools);
		}
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

		const repoStart = Date.now();
		await this.ensureDataRepositories();
		console.debug(`[Settings] Ensure repositories: ${Date.now() - repoStart}ms`);

		const configStart = Date.now();
		const userConfigExists = await this.userConfigExists();
		const userConfig = userConfigExists ? await this.readUserConfigFile() : null;
		let storedSettings: PluginSettings | null = null;
		let legacyConversations: Conversation[] = [];
		let legacyData: unknown = null;

		try {
			legacyData = await this.loadData();
		} catch (error) {
			console.debug('No legacy data found', error);
		}

		if (userConfig) {
			storedSettings = userConfigToPluginSettings(userConfig);
		}

		if (!storedSettings && legacyData && typeof legacyData === 'object') {
			storedSettings = legacyData as PluginSettings;
			const dataObj = legacyData as Record<string, unknown>;
			if (Array.isArray(dataObj.conversations)) {
				legacyConversations = dataObj.conversations as Conversation[];
			}
		}

		this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings ?? {});
		this.legacyConversations = legacyConversations;
		console.debug(`[Settings] Read config files: ${Date.now() - configStart}ms`);

		// Hydrate providers first as other methods may depend on it
		const providerStart = Date.now();
		await this.hydrateProvidersFromRepository();
		console.debug(`[Settings] Hydrate providers: ${Date.now() - providerStart}ms`);

		// Then hydrate other repositories in parallel
		const hydrateStart = Date.now();
		await Promise.all([
			this.hydratePromptsFromRepository(),
			this.hydrateAgentsFromRepository(),
			this.hydrateModelCaches(),
			this.hydrateMcpServersFromRepository()
		]);
		console.debug(`[Settings] Hydrate other data: ${Date.now() - hydrateStart}ms`);

		if (!userConfig) {
			await this.writeUserSettingsFile(this.settings);
		}

		// Migrate old agents that still have modelId to use new modelStrategy
		for (const agent of this.settings.agents) {
			const agentWithOldModel = agent as Agent & { modelId?: string };
			if ('modelId' in agent && typeof agentWithOldModel.modelId === 'string') {
				const modelId = agentWithOldModel.modelId;
				// Convert the old modelId to the new modelStrategy format
				agent.modelStrategy = {
					strategy: 'fixed',
					modelId: modelId
				};
				// Remove the old field
				delete agentWithOldModel.modelId;
			}

			// Ensure modelStrategy exists for all agents
			if (!agent.modelStrategy) {
				agent.modelStrategy = {
					strategy: 'default',
					modelId: this.settings.defaultModel || 'gpt-4o'
				};
			}
		}

		const totalTime = Date.now() - totalStart;
		console.debug(`[Settings] Total load time: ${totalTime}ms`);
	}

	async saveSettings() {
		await this.persistDataRepositories();
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

	private async ensureDataRepositories(): Promise<void> {
		if (!this.promptRepository) {
			this.promptRepository = new PromptRepository(this.app);
		}
		if (!this.agentRepository) {
			this.agentRepository = new AgentRepository(this.app);
		}
		if (!this.modelCacheRepository) {
			this.modelCacheRepository = new ModelCacheRepository(this.app);
		}
		if (!this.providerRepository) {
			this.providerRepository = new ProviderRepository(this.app);
		}
		if (!this.mcpServerRepository) {
			this.mcpServerRepository = new McpServerRepository(this.app);
		}
		if (!this.mcpToolCacheRepository) {
			this.mcpToolCacheRepository = new McpToolCacheRepository(this.app);
		}

		await Promise.all([
			this.promptRepository.initialize(),
			this.agentRepository.initialize(),
			this.modelCacheRepository.initialize(),
			this.providerRepository.initialize(),
			this.mcpServerRepository.initialize(),
			this.mcpToolCacheRepository.initialize()
		]);
	}

	private async hydratePromptsFromRepository(): Promise<void> {
		if (!this.promptRepository) return;
		const { prompts, activeId } = await this.promptRepository.loadAll();
		if (prompts.length > 0) {
			this.settings.systemPrompts = prompts;
			this.settings.activeSystemPromptId = activeId;
		} else if (this.settings.systemPrompts.length > 0) {
			await this.promptRepository.saveAll(this.settings.systemPrompts, this.settings.activeSystemPromptId ?? null);
		}
	}

	private async hydrateAgentsFromRepository(): Promise<void> {
		if (!this.agentRepository) return;
		const { agents, activeId } = await this.agentRepository.loadAll();
		if (agents.length > 0) {
			this.settings.agents = agents;
			this.settings.activeAgentId = activeId;
		} else if (this.settings.agents.length > 0) {
			await this.agentRepository.saveAll(this.settings.agents, this.settings.activeAgentId ?? null);
		}
	}

	private async hydrateModelCaches(): Promise<void> {
		if (!this.modelCacheRepository) return;
		await this.modelCacheRepository.applyCacheToConfigs(this.settings.llmConfigs ?? []);
	}

	private async hydrateMcpServersFromRepository(): Promise<void> {
		if (!this.mcpServerRepository || !this.mcpToolCacheRepository) return;
		const servers = await this.mcpServerRepository.loadAll();
		if (servers.length > 0) {
			const cacheMap = await this.mcpToolCacheRepository.loadAll();
			for (const server of servers) {
				const cache = cacheMap[server.name];
				if (cache) {
					server.cachedTools = cache.tools;
					server.cacheTimestamp = cache.updatedAt;
				}
			}
			this.settings.mcpServers = servers;
			return;
		}

		if (this.settings.mcpServers?.length) {
			await this.mcpServerRepository.saveAll(this.settings.mcpServers);
			await this.persistMcpToolCaches(this.settings.mcpServers);
			await this.writeUserSettingsFile(this.settings);
		}
	}

	private async persistDataRepositories(): Promise<void> {
		await this.ensureDataRepositories();
		const tasks: Promise<void>[] = [];
		if (this.promptRepository) {
			tasks.push(this.promptRepository.saveAll(this.settings.systemPrompts ?? [], this.settings.activeSystemPromptId ?? null));
		}
		if (this.agentRepository) {
			tasks.push(this.agentRepository.saveAll(this.settings.agents ?? [], this.settings.activeAgentId ?? null));
		}
		if (this.modelCacheRepository) {
			tasks.push(this.modelCacheRepository.saveFromConfigs(this.settings.llmConfigs ?? []));
		}
		if (this.providerRepository) {
			tasks.push(this.providerRepository.saveAll(this.settings.llmConfigs ?? []));
		}
		if (this.mcpServerRepository) {
			tasks.push(this.mcpServerRepository.saveAll(this.settings.mcpServers ?? []));
		}
		if (this.mcpToolCacheRepository) {
			tasks.push(this.persistMcpToolCaches(this.settings.mcpServers ?? []));
		}
		await Promise.all(tasks);
	}

	private async persistMcpToolCaches(servers: MCPServerConfig[]): Promise<void> {
		const repo = this.mcpToolCacheRepository;
		if (!repo) return;
		const ops = (servers ?? []).map(server =>
			repo.save(server.name, server.cachedTools ?? [], server.cacheTimestamp)
		);
		await Promise.all(ops);
	}

	private registerEditorMenuActions() {
		const handler = (menu: Menu, editor: Editor, view: MarkdownView) => {
			this.addEditorQuickActions(menu, editor, view);
		};

		this.registerEvent(this.app.workspace.on('editor-menu', handler));
	}

	private addEditorQuickActions(menu: Menu, editor: Editor, view: MarkdownView) {
		const selectedText = editor.getSelection();

		// Only show AI actions if text is selected
		if (!selectedText || selectedText.trim().length === 0) {
			return;
		}

		// Get enabled quick actions from settings
		const enabledActions = this.settings.quickActions.filter(action => action.enabled);

		if (enabledActions.length === 0) {
			return;
		}

		// Add separator before AI actions
		menu.addSeparator();

		// Icon mapping for common actions
		const iconMap: Record<string, string> = {
			'make-longer': 'text-cursor-input',
			'summarize': 'list-collapse',
			'improve-writing': 'pencil',
			'fix-grammar': 'spellcheck',
			'explain': 'lightbulb'
		};

		// Get the prefix (default to ⚡ if not set)
		const prefix = this.settings.quickActionPrefix || '⚡';

		// Add menu items for each enabled action
		for (const action of enabledActions) {
			menu.addItem((item) => {
				// Add prefix to action name
				const displayName = prefix ? `${prefix} ${action.name}` : action.name;

				item.setTitle(displayName)
					.setIcon(iconMap[action.id] || 'bot')
					.onClick(async () => {
						await this.handleEditorAIAction(
							editor,
							view,
							selectedText,
							action.prompt,
							action.actionType,
							action.model
						);
					});
			});
		}
	}

	private async handleEditorAIAction(
		editor: Editor,
		view: MarkdownView,
		selectedText: string,
		promptPrefix: string,
		actionType: 'replace' | 'explain',
		customModel?: string
	): Promise<void> {
		// Check if LLM is configured
		if (this.settings.llmConfigs.length === 0) {
			new Notice('Please configure an LLM provider in settings first');
			return;
		}

		// Use custom model if specified, otherwise use default model
		const modelId = customModel || this.settings.defaultModel;
		if (!modelId) {
			new Notice('Please select a default model in settings');
			return;
		}

		// Find the config for the model
		const config = ModelManager.findConfigForModelByProvider(modelId, this.settings.llmConfigs);
		if (!config) {
			new Notice(`No valid provider configuration found for model: ${modelId}`);
			return;
		}

		// Show loading notice
		const loadingNotice = new Notice('Processing...', 0);

		try {
			// Create provider
			const provider = ProviderFactory.createProvider(config);

			// Build the prompt
			const fullPrompt = promptPrefix + selectedText;

			// For explain action, show modal immediately
			let modal: ExplainTextModal | null = null;
			if (actionType === 'explain') {
				modal = new ExplainTextModal(this.app, 'Explanation');
				modal.open();
			}

			// Call LLM API with streaming
			let result = '';
			await provider.streamChat(
				{
					messages: [{ role: 'user', content: fullPrompt }],
					model: modelId,
					temperature: 0.7,
				},
				(chunk) => {
					if (!chunk.done && chunk.content) {
						result += chunk.content;
						// Update modal in real-time if explaining
						if (modal) {
							modal.updateContent(result);
						}
					}
				}
			);

			loadingNotice.hide();

			// Handle the result based on action type
			if (actionType === 'replace') {
				// Replace selected text with the result
				editor.replaceSelection(result.trim());
				new Notice('Text updated successfully');
			} else if (actionType === 'explain') {
				// Modal is already showing and updated
				if (!result) {
					modal?.showError('No explanation generated');
				}
			}
		} catch (error) {
			loadingNotice.hide();
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`Error: ${errorMsg}`);
			console.error('[Editor AI Action] Error:', error);
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

	private async hydrateProvidersFromRepository(): Promise<void> {
		if (!this.providerRepository) return;
		const providers = await this.providerRepository.loadAll();
		if (providers.length > 0) {
			this.settings.llmConfigs = providers;
			return;
		}

		if (this.settings.llmConfigs && this.settings.llmConfigs.length > 0) {
			await this.providerRepository.saveAll(this.settings.llmConfigs);
			await this.writeUserSettingsFile(this.settings);
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
