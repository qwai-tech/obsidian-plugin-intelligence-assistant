import type { MCPServerConfig, MCPRegistry, BuiltInToolConfig, OpenApiToolConfig, CLIToolConfig } from '@/features/tools';
import type { PluginSettings, QuickActionConfig, UserConfig } from '@/features/settings/types/settings';
import * as defaultUserConfigJson from '../../../config/default/settings.json';
import { deepClone } from '@/core/utils/type-guards';

const DEFAULT_USER_CONFIG: UserConfig = defaultUserConfigJson as UserConfig;
const DEFAULT_TITLE_PROMPT = 'Generate a short, descriptive title (max 6 words) for this conversation:\n\n{conversation}\n\nTitle:';
const generateId = (prefix = 'openapi'): string => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Default Quick Actions Configuration
 */
const DEFAULT_QUICK_ACTIONS: QuickActionConfig[] = [
	{
		id: 'make-longer',
		name: 'Make text longer',
		enabled: true,
		prompt: 'Expand and elaborate on the following text, making it more detailed and comprehensive while maintaining the original meaning and tone. Only return the expanded text without any additional commentary:\n\n',
		actionType: 'replace'
	},
	{
		id: 'summarize',
		name: 'Summarize text',
		enabled: true,
		prompt: 'Provide a concise summary of the following text. Only return the summary without any additional commentary:\n\n',
		actionType: 'replace'
	},
	{
		id: 'improve-writing',
		name: 'Improve writing',
		enabled: true,
		prompt: 'Improve the writing quality, clarity, and style of the following text. Only return the improved text without any additional commentary:\n\n',
		actionType: 'replace'
	},
	{
		id: 'fix-grammar',
		name: 'Fix grammar',
		enabled: true,
		prompt: 'Fix any grammar, spelling, and punctuation errors in the following text. Only return the corrected text without any additional commentary:\n\n',
		actionType: 'replace'
	},
	{
		id: 'explain',
		name: 'Explain text',
		enabled: true,
		prompt: 'Explain the following text in simple terms:\n\n',
		actionType: 'explain'
	}
];

const normalizeOpenApiConfigs = (value: unknown): OpenApiToolConfig[] => {
	if (!value) {
		return [];
	}
	const items = Array.isArray(value) ? value : [value];
	return items
		.filter(Boolean)
		.map((raw, index) => {
			const entry = raw as Partial<OpenApiToolConfig> & { specPath?: string; specUrl?: string; name?: string };
			const id = (entry.id && entry.id.trim()) || generateId(`openapi${index}`);
			const sourceType = entry.sourceType && (entry.sourceType === 'url' || entry.sourceType === 'file')
				? entry.sourceType
				: entry.specUrl?.trim() ? 'url' : 'file';
			return {
				id,
				name: entry.name?.trim() || `OpenAPI ${index + 1}`,
				enabled: Boolean(entry.enabled),
				sourceType,
				specPath: entry.specPath ?? '',
				specUrl: entry.specUrl ?? '',
				baseUrl: entry.baseUrl ?? '',
				authType: entry.authType ?? 'none',
				authKey: entry.authKey ?? '',
				authValue: entry.authValue ?? '',
				lastFetchedAt: entry.lastFetchedAt
			};
		});
};


export function userConfigToPluginSettings(userConfig?: UserConfig | null): PluginSettings {
	const source = userConfig ?? DEFAULT_USER_CONFIG;
	const systemPromptsSource = source.prompts?.system ?? DEFAULT_USER_CONFIG.prompts.system;
	const systemPrompts = deepClone(systemPromptsSource).map(prompt => ({
		...prompt,
		createdAt: prompt.createdAt && prompt.createdAt > 0 ? prompt.createdAt : Date.now(),
		updatedAt: prompt.updatedAt && prompt.updatedAt > 0 ? prompt.updatedAt : Date.now()
	}));

	const providerList = deepClone(source.providers?.list ?? DEFAULT_USER_CONFIG.providers.list);
	// Phase 4 migration: read from new config.tools.* paths first,
	// fall back to old config.* paths, then fall back to defaults.
	const rawSource = source as unknown as Record<string, unknown>;
	const oldMcp = rawSource?.['mcp'] as
		{ servers?: MCPServerConfig[]; registries?: MCPRegistry[] } | undefined;
	const oldTools = rawSource?.['tools'] as
		{ builtIn?: BuiltInToolConfig[]; openApi?: OpenApiToolConfig[]; cli?: CLIToolConfig[] } | undefined;

	const mcpServers = deepClone(
		source.tools?.mcp?.servers ??
		oldMcp?.servers ??
		DEFAULT_USER_CONFIG.tools.mcp.servers
	);
	const mcpRegistries = deepClone(
		source.tools?.mcp?.registries ??
		oldMcp?.registries ??
		DEFAULT_USER_CONFIG.tools.mcp.registries
	);
	const builtInTools = deepClone(
		source.tools?.builtin ??
		oldTools?.builtIn ??
		DEFAULT_USER_CONFIG.tools.builtin
	);
	const openApiTools = normalizeOpenApiConfigs(
		source.tools?.openapi ??
		oldTools?.openApi ??
		DEFAULT_USER_CONFIG.tools.openapi
	);
	const cliTools = deepClone(
		source.tools?.cli ??
		oldTools?.cli ?? []
	);
	const webSearch = deepClone(source.search?.web ?? DEFAULT_USER_CONFIG.search.web);
	const agents = deepClone(source.agents?.list ?? []);
	const agentMemories = deepClone(source.agents?.memories ?? []);

	const quickActions = deepClone(source.quickActions?.list ?? DEFAULT_QUICK_ACTIONS);

	const defaults = DEFAULT_USER_CONFIG.rag;
	const rag = { ...defaults, ...source.rag };
	const retrieval = { ...defaults.retrieval, ...source.rag?.retrieval };
	const embedding = { ...defaults.embedding, ...source.rag?.embedding };
	const caching = { ...defaults.caching, ...source.rag?.caching };
	const grader = { ...defaults.grader, ...source.rag?.grader };
	const thresholds = { ...defaults.grader.thresholds, ...source.rag?.grader?.thresholds };
	const reranking = { enabled: false, model: 'cross-encoder', ...defaults.reranking, ...source.rag?.reranking };

	return {
		lastVersion: source.lastVersion,
		llmConfigs: providerList,
		defaultModel: source.providers?.defaultModel ?? DEFAULT_USER_CONFIG.providers.defaultModel,
		titleSummaryModel: source.providers?.titleSummaryModel ?? DEFAULT_USER_CONFIG.providers.titleSummaryModel ?? '',
		defaultChatMode: source.conversations?.defaultMode === 'agent' ? 'agent' : 'chat',
		conversationTitleMode: source.conversations?.title?.mode ?? DEFAULT_USER_CONFIG.conversations.title.mode,
		titleSummaryPrompt: source.conversations?.title?.prompt ?? DEFAULT_TITLE_PROMPT,
		conversationIconEnabled: source.conversations?.icon?.enabled ?? true,
		conversations: [],
		activeConversationId: source.conversations?.activeId ?? null,
		mcpServers: mcpServers,
		mcpRegistries: mcpRegistries,
		builtInTools: builtInTools,
		openApiTools: openApiTools,
		cliTools: cliTools,
		ragConfig: {
			enabled: rag.enabled,
			chunkSize: retrieval.chunkSize,
			chunkOverlap: retrieval.chunkOverlap,
			topK: retrieval.topK,
			similarityThreshold: retrieval.similarityThreshold,
			relevanceScoreWeight: retrieval.relevanceScoreWeight,
			searchType: retrieval.searchType,
			chunkingStrategy: retrieval.chunkingStrategy,
			contextWindowLimit: retrieval.contextWindowLimit,
			filterByTag: retrieval.filterByTag,
			excludeByTag: retrieval.excludeByTag,
			embeddingModel: embedding.model,
			vectorStore: embedding.vectorStore,
			embedChangedFiles: embedding.embedChangedFiles,
			maxTokensPerChunk: embedding.maxTokensPerChunk,
			minChunkSize: embedding.minChunkSize,
			embeddingBatchSize: embedding.batchSize,
			indexingMode: embedding.indexingMode,
			includeFileTypes: embedding.includeFileTypes,
			excludeFileTypes: embedding.excludeFileTypes,
			excludeFolders: embedding.excludeFolders,
			enableCompression: rag.enableCompression ?? false,
			enableSemanticCaching: caching.enabled,
			cacheSize: caching.cacheSize,
			reRankingEnabled: reranking?.enabled ?? false,
			reRankingModel: reranking?.model ?? 'cross-encoder',
			enableGradingThreshold: grader.enabled,
			graderModelSource: grader.modelSource,
			graderModel: grader.model,
			graderPromptTemplate: grader.promptTemplate,
			graderParallelProcessing: grader.parallelProcessing,
			minRelevanceScore: thresholds.relevance,
			minAccuracyScore: thresholds.accuracy,
			minSupportQualityScore: thresholds.supportQuality
		},
		webSearchConfig: webSearch,
		systemPrompts,
		activeSystemPromptId: source.prompts?.activeId ?? null,
		agents: agents,
		agentMemories: agentMemories,
		activeAgentId: source.agents?.activeId ?? null,
		quickActions: quickActions,
		quickActionPrefix: source.quickActions?.prefix ?? '⚡'
	};
}

export function pluginSettingsToUserConfig(settings: PluginSettings): UserConfig {
	return {
		version: DEFAULT_USER_CONFIG.version,
		lastVersion: settings.lastVersion,
		providers: {
			defaultModel: settings.defaultModel,
			titleSummaryModel: settings.titleSummaryModel,
			list: []
		},
		conversations: {
			title: {
				mode: settings.conversationTitleMode,
				prompt: settings.titleSummaryPrompt
			},
			icon: {
				enabled: settings.conversationIconEnabled
			},
			defaultMode: settings.defaultChatMode ?? 'chat',
			activeId: settings.activeConversationId
		},
		tools: {
			builtin: deepClone(settings.builtInTools ?? []),
			mcp: {
				servers: deepClone(settings.mcpServers ?? []),
				registries: deepClone(settings.mcpRegistries ?? []),
			},
			openapi: deepClone(settings.openApiTools ?? []),
			cli: deepClone(settings.cliTools ?? []),
		},
		rag: {
			enabled: settings.ragConfig.enabled,
			enableCompression: settings.ragConfig.enableCompression,
			retrieval: {
			chunkSize: settings.ragConfig.chunkSize,
			chunkOverlap: settings.ragConfig.chunkOverlap,
			topK: settings.ragConfig.topK,
			similarityThreshold: settings.ragConfig.similarityThreshold,
			relevanceScoreWeight: settings.ragConfig.relevanceScoreWeight,
			searchType: settings.ragConfig.searchType,
			chunkingStrategy: settings.ragConfig.chunkingStrategy,
			contextWindowLimit: settings.ragConfig.contextWindowLimit,
			filterByTag: settings.ragConfig.filterByTag,
			excludeByTag: settings.ragConfig.excludeByTag
		},
			embedding: {
			model: settings.ragConfig.embeddingModel,
			vectorStore: settings.ragConfig.vectorStore,
			embedChangedFiles: settings.ragConfig.embedChangedFiles,
			maxTokensPerChunk: settings.ragConfig.maxTokensPerChunk,
			minChunkSize: settings.ragConfig.minChunkSize,
			batchSize: settings.ragConfig.embeddingBatchSize,
			indexingMode: settings.ragConfig.indexingMode,
			includeFileTypes: settings.ragConfig.includeFileTypes,
			excludeFileTypes: settings.ragConfig.excludeFileTypes,
			excludeFolders: settings.ragConfig.excludeFolders
		},
			caching: {
			enabled: settings.ragConfig.enableSemanticCaching,
			cacheSize: settings.ragConfig.cacheSize
			},
			reranking: {
			enabled: settings.ragConfig.reRankingEnabled,
			model: settings.ragConfig.reRankingModel
			},
				grader: {
				enabled: settings.ragConfig.enableGradingThreshold,
				modelSource: settings.ragConfig.graderModelSource,
				model: settings.ragConfig.graderModel ?? '',
				promptTemplate: settings.ragConfig.graderPromptTemplate ?? '',
			parallelProcessing: settings.ragConfig.graderParallelProcessing,
			thresholds: {
				relevance: settings.ragConfig.minRelevanceScore ?? 0,
				accuracy: settings.ragConfig.minAccuracyScore ?? 0,
				supportQuality: settings.ragConfig.minSupportQualityScore ?? 0
			}
			}
		},
		search: {
			web: deepClone(settings.webSearchConfig)
		},
		prompts: {
			system: [],
			activeId: settings.activeSystemPromptId ?? null
		},
		agents: {
			list: [],
			activeId: settings.activeAgentId ?? null,
			memories: []
		},
		quickActions: {
			list: deepClone(settings.quickActions ?? DEFAULT_QUICK_ACTIONS),
			prefix: settings.quickActionPrefix ?? '⚡'
		}
	};
}



export const DEFAULT_SETTINGS: PluginSettings = userConfigToPluginSettings(DEFAULT_USER_CONFIG);
