import { Menu, Plugin, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import './src/presentation/components/chat/settings.css';
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
	Workflow,
	WorkflowExecution,
	Message,
	UserConfig
} from './src/types';
import { DEFAULT_SETTINGS, pluginSettingsToUserConfig, userConfigToPluginSettings } from './src/types';
import { ChatView, CHAT_VIEW_TYPE } from './src/presentation/views/chat-view';
import { ToolManager } from './src/application/services/tool-manager';
import { WorkflowEditorView, WORKFLOW_EDITOR_VIEW_TYPE } from './src/presentation/views/workflow-editor-view';
import { IntelligenceAssistantSettingTab } from './src/presentation/components/settings-tab';
import {
	USER_CONFIG_FOLDER,
	USER_CONFIG_PATH
} from './src/constants';

import { createWorkflowFile, getTargetFolder } from './src/application/services/workflow-service';
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
	WorkflowDataRepository,
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
	Workflow,
	WorkflowExecution,
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

export default class IntelligenceAssistantPlugin extends Plugin {
	settings: PluginSettings;
	
	// Architecture components
	private conversationStorageService: ConversationStorageService | null = null;
	private conversationMigrationService: ConversationMigrationService | null = null;
	private sharedToolManager: ToolManager | null = null;
	private chatRibbonIconEl: HTMLElement | null = null;
	private legacyConversations: Conversation[] = [];
	private promptRepository: PromptRepository | null = null;
	private agentRepository: AgentRepository | null = null;
	private workflowRepository: WorkflowDataRepository | null = null;
	private modelCacheRepository: ModelCacheRepository | null = null;
	private providerRepository: ProviderRepository | null = null;
	private mcpServerRepository: McpServerRepository | null = null;
	private mcpToolCacheRepository: McpToolCacheRepository | null = null;

	async onload() {
		// Initialize architecture components using dependency injection
		this.initializeArchitecture();
		
		// Initialize conversation storage system first
		this.conversationStorageService = new ConversationStorageService(this.app);
		await this.conversationStorageService.initialize();
		
		await this.loadSettings();
		await this.migrateConversationsIfNeeded();
		await this.ensureDefaultAgent();
		await this.ensureAutoConnectedMcpServers();

		// Register the chat view
		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new ChatView(leaf, this)
		);

		// Register the workflow editor view
		this.registerView(
			WORKFLOW_EDITOR_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new WorkflowEditorView(leaf, this)
		);
		this.registerExtensions(['workflow'], WORKFLOW_EDITOR_VIEW_TYPE);

		// Add command to open chat in right sidebar
		this.addCommand({
			id: 'open-chat-sidebar',
			name: 'Open AI chat in sidebar',
			callback: async () => {
				await this.openChatViewInRightSidebar();
			}
		});

		// Add ribbon icon for quick chat access
		this.chatRibbonIconEl = this.addRibbonIcon('message-circle', 'Open AI Chat', async () => {
			await this.openChatViewInRightSidebar();
		});
		this.chatRibbonIconEl?.addClass('ia-ribbon-chat-icon');

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new IntelligenceAssistantSettingTab(this.app, this));

		// Register file explorer context menu actions
		this.registerFileMenuActions();
	}

	onunload() {
		// Cleanup architecture components
		this.cleanupArchitecture();

		// Clean up tool manager (don't detach leaves to preserve user layout)
		if (this.sharedToolManager) {
			this.sharedToolManager.cleanup().catch(error => console.error('[MCP] Cleanup failed', error));
			this.sharedToolManager = null;
		}
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

	public syncToolManagerConfig() {
		if (this.sharedToolManager) {
			this.sharedToolManager.setToolConfigs(this.settings.builtInTools);
		}
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
		await this.ensureDataRepositories();
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

		// Hydrate providers first as other methods may depend on it
		await this.hydrateProvidersFromRepository();
		
		// Then hydrate other repositories in parallel
		await Promise.all([
			this.hydratePromptsFromRepository(),
			this.hydrateAgentsFromRepository(),
			this.hydrateModelCaches(),
			this.hydrateMcpServersFromRepository(),
			this.migrateWorkflowData(legacyData)
		]);

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
		if (!this.workflowRepository) {
			this.workflowRepository = new WorkflowDataRepository(this.app);
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
			this.workflowRepository.initialize(),
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

	private async migrateWorkflowData(legacyData: unknown): Promise<void> {
		if (!this.workflowRepository) return;
		
		let legacyWorkflows: Workflow[] = [];
		let legacyExecutions: WorkflowExecution[] = [];
		
		if (legacyData && typeof legacyData === 'object') {
			const dataObj = legacyData as Record<string, unknown>;
			if (Array.isArray(dataObj.workflows)) {
				legacyWorkflows = dataObj.workflows as Workflow[];
			}
			if (Array.isArray(dataObj.workflowExecutions)) {
				legacyExecutions = dataObj.workflowExecutions as WorkflowExecution[];
			}
		}

		if (legacyWorkflows.length > 0) {
			const existing = await this.workflowRepository.loadAllWorkflows();
			if (existing.length === 0) {
				await this.workflowRepository.replaceAll(legacyWorkflows);
			}
		}

		for (const execution of legacyExecutions) {
			await this.workflowRepository.saveExecution(execution);
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

	private registerFileMenuActions() {
		const handler = (menu: Menu, file?: TAbstractFile) => {
			this.addWorkflowCreationAction(menu, file);
		};

		this.registerEvent(this.app.workspace.on('file-menu', handler));
	}

	private addWorkflowCreationAction(menu: Menu, file?: TAbstractFile) {
		const targetFolder = getTargetFolder(this.app, file);

		if (!targetFolder) {
			return;
		}

		menu.addItem((item) => {
			item.setTitle('Create intelligence workflow')
				.setIcon('git-branch-plus')
				.onClick(async () => {
					await createWorkflowFile(this.app, targetFolder);
				});
		});
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

	public async getWorkflowDataRepository(): Promise<WorkflowDataRepository> {
		await this.ensureDataRepositories();
		if (!this.workflowRepository) {
			throw new Error('Workflow repository not initialized');
		}
		return this.workflowRepository;
	}

	public async getConversationStorageService(): Promise<ConversationStorageService> {
		if (!this.conversationStorageService) {
			this.conversationStorageService = new ConversationStorageService(this.app);
			await this.conversationStorageService.initialize();
		}
		return this.conversationStorageService;
	}

}
