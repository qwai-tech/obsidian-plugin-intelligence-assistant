import { getLanguage, Notice, Plugin, type WorkspaceLeaf } from 'obsidian';
import { t, initI18n } from './src/i18n';
import './src/ui/chat/settings.css';
import './src/ui/modals/explain-text-modal.css';
import type { PluginSettings } from './src/features/settings';
import { pluginPaths } from './src/core/plugin-paths';
import { ensureFolderExists } from './src/core/utils/file-system';
import { ModelManager, createObsidianHttpPort, setDefaultHttpPort, setDiagnosticsSink, withResilience, type LLMHub } from '@qwai/obsidian-llm';
import { SettingsStore, reloadSettingsFromDisk as runSettingsReload } from './src/features/settings';
import { LegacySettingsFiles } from './src/adapters/persistence/legacy-settings-files';
import { ObsidianSecretVault } from './src/adapters/obsidian/obsidian-secret-vault';
import { ObsidianSettingsPersistence } from './src/bootstrap/obsidian-settings-persistence';
import { buildImproveSelectionPrompt, ensureDefaultAgent as ensureDefaultAgentService } from './src/features/agent';
import { ConversationStorageService } from './src/adapters/persistence/conversation-storage-service';
import { ConversationMigrationService } from './src/adapters/persistence/conversation-migration-service';
import { PluginDataService } from './src/bootstrap/plugin-data-service';
import { LLMHubService } from './src/features/llm';
import { ChatView, CHAT_VIEW_TYPE } from './src/ui/views/chat-view';
import { ChatWorkspace } from './src/ui/views/chat-workspace';
import { AgentTaskLauncher } from './src/ui/views/agent-task-launcher';
import { IntelligenceAssistantSettingTab } from './src/ui/settings/settings-tab';
import { ChangelogModal } from './src/ui/modals/changelog-modal';
import { openModelSwitcher } from './src/ui/modals/model-switcher-modal';
import { EditorQuickActions } from './src/ui/editor/editor-quick-actions';
import { aiSelectionEditorExtension } from './src/ui/editor/ai-selection-extension';
import { registerChatHoverLinkSource } from './src/ui/chat/hover-link';
import { AgentStatusBar } from './src/ui/status/agent-status-bar';
import type { AppServices } from './src/ui/app-services';
import { createServices, type OwnedServices } from './src/bootstrap/create-services';
import { registerAgentEntryPoints } from './src/bootstrap/agent-entry-points';
import { registerDeepLinks, registerIncrementalRagIndexing, registerInlineAiBlocks } from './src/bootstrap/plugin-integrations';

export default class IntelligenceAssistantPlugin extends Plugin {
	editorQuickActions!: EditorQuickActions;
	llmHub!: LLMHub;

	private dataService!: PluginDataService;
	private conversations!: ConversationStorageService;
	private owned: OwnedServices | null = null;
	private resolveServices!: (services: AppServices) => void;
	private rejectServices!: (error: unknown) => void;
	private readonly servicesReady = new Promise<AppServices>((resolve, reject) => {
		this.resolveServices = resolve;
		this.rejectServices = reject;
	});
	private chatWorkspace!: ChatWorkspace;
	private launcher!: AgentTaskLauncher;
	private statusBar: AgentStatusBar | null = null;
	private statusBarEl!: HTMLElement;
	settings!: PluginSettings;
	private store!: SettingsStore;

	get services(): AppServices {
		if (!this.owned) {
			throw new Error('Intelligence Assistant services are not ready');
		}
		return this.owned;
	}

	whenServicesReady(): Promise<AppServices> {
		return this.servicesReady;
	}

	async onload() {
		const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		initI18n(undefined, pluginDir);
		setDefaultHttpPort(withResilience(createObsidianHttpPort()));
		setDiagnosticsSink(({ message }) => { new Notice(message); });
		this.llmHub = new LLMHubService({
			getLLMConfigs: () => this.store?.peek()?.llmConfigs ?? [],
			getDefaultModelId: () => this.store?.peek()?.defaultModel ?? null,
		});

		this.chatWorkspace = new ChatWorkspace(this.app);
		this.launcher = new AgentTaskLauncher(this.app, this.chatWorkspace);
		this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));
		this.registerChatCommands();
		registerAgentEntryPoints(this, this.launcher);
		registerChatHoverLinkSource(this);
		this.registerEditorExtension([
			aiSelectionEditorExtension((selection, sourcePath) => {
				void this.launcher.launch(buildImproveSelectionPrompt(selection, sourcePath), []);
			}),
		]);
		registerIncrementalRagIndexing(this, () => this.owned?.rag ?? null, () => this.store?.peek()?.ragConfig);
		registerInlineAiBlocks(this, this.launcher);
		registerDeepLinks(this, this.launcher);
		this.addRibbonIcon('message-circle', t('ribbon.openChat'), async () => {
			await this.chatWorkspace.openInSidebar();
		})?.addClass('ia-ribbon-chat-icon');
		this.addSettingTab(new IntelligenceAssistantSettingTab(this.app, this));
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass('ia-status-bar-item');

		try {
			await this.loadStorage(pluginDir);
			await this.loadSettings();
			this.editorQuickActions.register(this);
			this.startServices(pluginDir);
		} catch (error) {
			console.error('[Plugin] Initialization failed:', error);
			this.rejectServices(error);
		}

		void this.deferredInitialization();
	}

	onunload() {
		this.statusBar?.dispose();
		this.statusBar = null;
		this.owned?.dispose().catch((error) => console.error('[Plugin] Service dispose failed:', error));
		this.owned = null;
	}

	onUserEnable(): void {
		this.statusBar?.render();
		void this.chatWorkspace.openInSidebar();
	}

	async onExternalSettingsChange(): Promise<void> {
		try {
			await this.reloadSettingsFromDisk();
		} catch (error) {
			console.error('[Plugin] onExternalSettingsChange failed:', error);
		}
	}

	async reloadSettingsFromDisk(): Promise<void> {
		if (!this.dataService) return;
		await runSettingsReload({
			loadSettings: () => this.loadSettings(),
			invalidateDerivedState: () => { this.owned?.rag.updateConfig(this.settings.ragConfig, this.settings.llmConfigs); },
			refreshChatViewsModels: () => this.chatWorkspace.refreshModels(),
			reloadToolSources: async () => { await this.owned?.tools.resync(); },
			refreshStatusBar: () => this.statusBar?.render(),
		});
	}

	async ensureDefaultAgent(): Promise<void> {
		await ensureDefaultAgentService(this.settings, async () => await this.saveSettings());
	}

	private async loadStorage(pluginDir: string): Promise<void> {
		const paths = pluginPaths(pluginDir);
		await ensureFolderExists(this.app.vault.adapter, paths.data);
		this.conversations = new ConversationStorageService(this.app, paths);
		await this.conversations.initialize();
		this.dataService = new PluginDataService(this.app, paths);
		this.dataService.initialize();
		this.store = new SettingsStore(
			new ObsidianSettingsPersistence(this, this.dataService, new LegacySettingsFiles(this.app.vault.adapter, paths)),
			new ObsidianSecretVault(this.app),
		);
		this.editorQuickActions = new EditorQuickActions(this.app, () => ({
			quickActions: this.settings.quickActions,
			quickActionPrefix: this.settings.quickActionPrefix || '⚡',
			llmConfigs: this.settings.llmConfigs,
			defaultModel: this.settings.defaultModel,
		}));
	}

	private startServices(pluginDir: string): void {
		this.owned = createServices({
			app: this.app,
			settings: () => this.settings,
			saveSettings: () => this.saveSettings(),
			paths: pluginPaths(pluginDir),
			data: this.dataService,
			conversations: this.conversations,
		});
		const services = this.owned;
		this.register(this.store.onChange((units) => {
			if (units.has('providers') || units.has('config')) {
				services.rag.updateConfig(this.settings.ragConfig, this.settings.llmConfigs);
				void this.chatWorkspace.refreshModels();
			}
		}));
		this.statusBar = new AgentStatusBar(this.statusBarEl, this.owned.activity, this.owned.usage);
		this.statusBar.render();
		this.resolveServices(this.owned);
	}

	private registerChatCommands(): void {
		this.addCommand({
			id: 'open-chat-sidebar',
			name: t('commands.openChatSidebar'),
			callback: async () => {
				await this.chatWorkspace.openInSidebar();
			},
		});
		this.addCommand({
			id: 'open-chat-main',
			name: t('commands.openChatMain'),
			callback: async () => {
				await this.chatWorkspace.openInMainArea();
			},
		});
		this.addCommand({
			id: 'switch-model',
			name: t('commands.switchModel'),
			callback: () => {
				void openModelSwitcher(this.app, {
					getModels: () => ModelManager.getAllAvailableModels(this.settings.llmConfigs),
					getCurrentModelId: () => this.settings.defaultModel,
					applyModel: async (modelId: string) => {
						this.settings.defaultModel = modelId;
						await this.saveSettings();
					},
				});
			},
		});
	}

	private async deferredInitialization(): Promise<void> {
		this.app.workspace.onLayoutReady(async () => {
			const currentVersion = this.manifest.version;
			const isAutomatedTest = typeof process !== 'undefined'
				&& (process.env.NODE_ENV === 'test' || Boolean(process.env.WDIO_WORKER_ID));
			if (this.store?.peek() && currentVersion !== (this.settings.lastVersion || '0.0.0') && !isAutomatedTest) {
				new ChangelogModal(this.app, currentVersion, getLanguage().startsWith('zh')).open();
				this.settings.lastVersion = currentVersion;
				await this.saveSettings();
			}
		});

		const services = await this.servicesReady.catch(() => null);
		if (!services) return;
		await Promise.all([
			this.migrateConversationsIfNeeded().catch((error) => console.error('[Plugin] Conversation migration failed:', error)),
			this.ensureDefaultAgent().catch((error) => console.error('[Plugin] Ensure default agent failed:', error)),
			services.tools.initialize().catch((error) => console.error('[Plugin] Tool sources failed to load:', error)),
		]);
	}

	async loadSettings(): Promise<void> {
		await this.store.load();
		this.settings = this.store.current;
	}

	refreshSecretKeys(): void {
		this.store.refreshKeys();
	}

	async updateSettings(change: (settings: PluginSettings) => void): Promise<void> {
		await this.store.update(change);
	}

	async saveSettings(): Promise<void> {
		await this.store.save();
	}

	private async migrateConversationsIfNeeded() {
		const migration = new ConversationMigrationService(this.conversations);
		const legacyConversations = this.store.legacyConversations;

		if (legacyConversations.length > 0) {
			const success = await migration.migrateFromOldFormat(legacyConversations);
			
			if (success) {
				legacyConversations.length = 0;
				this.settings.conversations = [];
				await this.saveSettings();
			} else {
				console.error('Conversation migration failed');
			}
		}
	}
}
