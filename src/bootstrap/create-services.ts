import { notify } from '@/core/notifications';
import { type App } from 'obsidian';
import { t } from '@/i18n';
import { ModelManager, ProviderFactory, getDefaultHttpPort, setLLMRequestObserver } from '@qwai/obsidian-llm';
import type { PluginSettings } from '@/features/settings';
import type { AppServices } from '@/ui/app-services';
import { RAGManager } from '@/adapters/rag/rag-manager';
import { ObsidianFileSystem } from '@/adapters/obsidian/obsidian-file-system';
import { ToolRegistry, ToolSourceManager } from '@/features/tools';
import { WebSearchService } from '@/features/web-search';
import { AgentMemoryService, AgentSenseService, AgentEngineLoop, HistoryCompactor, RunActivity, RunCoordinator } from '@/features/agent';
import { JsonlRunJournal } from '@/adapters/persistence/jsonl-run-journal';
import type { PluginPaths } from '@/core/plugin-paths';
import { ChatService, VaultExportService, ConversationNamer } from '@/features/chat';
import { OllamaAdmin } from '@/features/llm';
import type { ConversationStorageService } from '@/adapters/persistence/conversation-storage-service';
import type { PluginDataService } from '@/bootstrap/plugin-data-service';
import { ModalExportTargetPicker } from '@/ui/modals/modal-export-target-picker';
import { createToolSourceFactory } from './tool-source-factory';

export interface ServiceHost {
	app: App;
	settings: () => PluginSettings;
	updateSettings: (change: (settings: PluginSettings) => void) => Promise<void>;
	paths: PluginPaths;
	data: PluginDataService;
	conversations: ConversationStorageService;
}

export interface OwnedServices extends AppServices {
	dispose(): Promise<void>;
}

export function createServices(host: ServiceHost): OwnedServices {
	const { app, settings, data } = host;
	const rag = new RAGManager(app, settings().ragConfig, settings().llmConfigs, host.paths.vectorStoreNotes);
	const registry = new ToolRegistry();
	const tools = new ToolSourceManager(registry, createToolSourceFactory(app, host.paths.data), settings, host.updateSettings);
	const webSearch = new WebSearchService(() => settings().webSearchConfig, getDefaultHttpPort(), (problem) => notify(t('chat.notices.webSearchFailed', { message: problem })));
	const activity = new RunActivity();
	const runs = new RunCoordinator();
	const removeObserver = setLLMRequestObserver(async event => {
		await data.tokenUsageRepo.recordUsage({ model: event.model, provider: event.provider, timestamp: Date.now(),
			promptTokens: event.usage?.promptTokens ?? 0, completionTokens: event.usage?.completionTokens ?? 0, totalTokens: event.usage?.totalTokens ?? 0,
			usageKnown: Boolean(event.usage), requestId: event.id, connectionId: event.connectionId, conversationId: event.conversationId,
			operation: event.operation, purpose: event.purpose, status: event.status, durationMs: event.durationMs });
		activity.usageRecorded();
	});
	const agentMemory = new AgentMemoryService(data.agentMemoryRepo);
	const agentLoop = new AgentEngineLoop({
		app, runs,
		toolRegistry: registry,
		senseService: new AgentSenseService(app, rag, agentMemory),
		memoryWriter: agentMemory,
		historyCompactor: new HistoryCompactor(),
		webSearchService: webSearch,
		memoryIndex: rag,
		journal: new JsonlRunJournal(app.vault.adapter, host.paths.agentRuns),
		createProvider: (modelId) => {
			const config = ModelManager.findConfigForModelByProvider(modelId, settings().llmConfigs);
			return config ? { provider: ProviderFactory.createProvider(config), providerId: config.provider } : null;
		},
		defaultModel: () => settings().defaultModel,
	});
	const chat = new ChatService({
		fileSystem: new ObsidianFileSystem(app),
		knowledge: rag,
		webSearchService: webSearch,
		settings,
		runs,
		agentEngineLoop: agentLoop,
	});

	return {
		rag,
		tools,
		chat,
		vaultExport: new VaultExportService(app, new ModalExportTargetPicker(app)),
		conversations: host.conversations,
		usage: data.tokenUsageRepo,
		activity,
		ollama: new OllamaAdmin(getDefaultHttpPort()),
		namer: new ConversationNamer(settings),
		dispose: async () => {
			await runs.dispose();
			await Promise.all([registry.dispose(), rag.destroy()]);
			removeObserver();
		},
	};
}
