import type { App } from 'obsidian';
import { ModelManager, ProviderFactory, getDefaultHttpPort } from '@qwai/obsidian-llm';
import type { PluginSettings } from '@/features/settings';
import type { UsageRecord } from '@/features/usage';
import type { AppServices } from '@/ui/app-services';
import { RAGManager } from '@/adapters/rag/rag-manager';
import { ObsidianFileSystem } from '@/adapters/obsidian/obsidian-file-system';
import { ToolRegistry, ToolSourceManager } from '@/features/tools';
import { WebSearchService } from '@/features/web-search';
import { AgentMemoryService, AgentSenseService, AgentEngineLoop, HistoryCompactor, RunActivity } from '@/features/agent';
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
	const webSearch = new WebSearchService(() => settings().webSearchConfig, getDefaultHttpPort());
	const activity = new RunActivity();
	const recordUsage = async (record: UsageRecord) => {
		await data.tokenUsageRepo.recordUsage(record);
		activity.usageRecorded();
	};
	const agentMemory = new AgentMemoryService(data.agentMemoryRepo);
	const agentLoop = new AgentEngineLoop({
		app,
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
		recordUsage,
		defaultModel: () => settings().defaultModel,
	});
	const chat = new ChatService({
		fileSystem: new ObsidianFileSystem(app),
		knowledge: rag,
		webSearchService: webSearch,
		settings,
		usageRepo: { recordUsage },
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
		namer: new ConversationNamer(settings, { recordUsage: (record) => void recordUsage(record) }),
		dispose: async () => {
			await Promise.all([registry.dispose(), rag.destroy()]);
		},
	};
}
