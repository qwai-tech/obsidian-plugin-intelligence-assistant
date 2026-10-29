import type { App } from 'obsidian';
import { ModelManager, ProviderFactory, getDefaultHttpPort } from '@qwai/obsidian-llm';
import type { PluginSettings } from '@/types';
import type { UsageRecord } from '@/types/features/usage';
import type { AppServices } from '@/presentation/app-services';
import { RAGManager } from '@/infrastructure/rag-manager';
import { ObsidianFileSystem } from '@/infrastructure/obsidian/obsidian-file-system';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { ToolSourceManager } from '@/application/tools/tool-source-manager';
import { WebSearchService } from '@/application/services/web-search-service';
import { AgentMemoryService } from '@/application/services/agent-memory-service';
import { AgentSenseService } from '@/application/agents/agent-sense-service';
import { AgentEngineLoop } from '@/application/agents/agent-engine-loop';
import { HistoryCompactor } from '@/application/agents/history-compactor';
import { JsonlRunJournal } from '@/infrastructure/persistence/jsonl-run-journal';
import { pluginPaths } from '@/core/plugin-paths';
import { ChatService } from '@/application/services/chat.service';
import { VaultExportService } from '@/application/services/vault-export-service';
import { RunActivity } from '@/application/services/run-activity';
import { OllamaAdmin } from '@/application/services/ollama-admin';
import { ConversationNamer } from '@/application/services/conversation-namer';
import type { ConversationStorageService } from '@/infrastructure/persistence/conversation-storage-service';
import type { PluginDataService } from '@/bootstrap/plugin-data-service';
import { ModalExportTargetPicker } from '@/presentation/components/modals/modal-export-target-picker';
import { createToolSourceFactory } from './tool-source-factory';

export interface ServiceHost {
	app: App;
	settings: () => PluginSettings;
	saveSettings: () => Promise<void>;
	pluginDataPath: string;
	data: PluginDataService;
	conversations: ConversationStorageService;
}

export interface OwnedServices extends AppServices {
	dispose(): Promise<void>;
}

export function createServices(host: ServiceHost): OwnedServices {
	const { app, settings, data } = host;
	const rag = new RAGManager(app, settings().ragConfig, settings().llmConfigs);
	const registry = new ToolRegistry();
	const tools = new ToolSourceManager(registry, createToolSourceFactory(app, host.pluginDataPath), settings, host.saveSettings);
	const webSearch = new WebSearchService(() => settings().webSearchConfig, getDefaultHttpPort());
	const activity = new RunActivity();
	const recordUsage = async (record: UsageRecord) => {
		await data.tokenUsageRepo.recordUsage(record);
		activity.usageRecorded();
	};
	const agentLoop = new AgentEngineLoop({
		app,
		toolRegistry: registry,
		senseService: new AgentSenseService(app, rag, new AgentMemoryService(data.agentMemoryRepo)),
		historyCompactor: new HistoryCompactor(),
		webSearchService: webSearch,
		memoryIndex: rag,
		journal: new JsonlRunJournal(app.vault.adapter, pluginPaths(app.vault.configDir).agentRuns),
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
		namer: new ConversationNamer(settings),
		dispose: async () => {
			await Promise.all([registry.dispose(), rag.destroy()]);
		},
	};
}
