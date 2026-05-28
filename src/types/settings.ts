/**
 * Plugin Settings Types
 * Root configuration type for the plugin
 */

import type { LLMConfig } from './core/model';
import type { Conversation } from './core/conversation';
import type { MCPServerConfig, MCPRegistry } from './features/mcp';
import type { BuiltInToolConfig } from './common/tools';
import type { RAGConfig } from './features/rag';
import type { WebSearchConfig } from './features/web-search';
import type { OpenApiToolConfig } from './features/openapi-tools';
import type { CLIToolConfig } from './features/cli-tools';
import type { SystemPrompt, Agent } from './core/agent';
import type { AgentMemory } from './features/memory';
import * as defaultUserConfigJson from '../../config/default/settings.json';
import { deepClone } from '@/utils/type-guards';
import { migrateAllAgents } from '@/application/tools/tool-migrations';

/**
 * Quick Action Configuration
 * Defines settings for editor context menu AI actions
 */
export interface QuickActionConfig {
	id: string;
	name: string;
	enabled: boolean;
	prompt: string;
	model?: string; // If not specified, use default model
	actionType: 'replace' | 'explain';
}

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

export interface UserConfig {
	version: number;
	providers: {
		list: LLMConfig[];
		defaultModel: string;
		titleSummaryModel?: string;
	};
	conversations: {
		title: {
			mode: string;
			prompt: string;
		};
		icon: {
			enabled: boolean;
		};
		defaultMode?: 'chat' | 'agent';
		activeId: string | null;
	};
	tools: {
		builtin: BuiltInToolConfig[];
		mcp: {
			servers: MCPServerConfig[];
			registries: MCPRegistry[];
		};
		openapi: OpenApiToolConfig[];
		cli: CLIToolConfig[];
	};
	rag: {
		enabled: boolean;
		enableCompression?: boolean;
		retrieval: {
			chunkSize: number;
			chunkOverlap: number;
			topK: number;
			similarityThreshold: number;
			relevanceScoreWeight: number;
			searchType: string;
			chunkingStrategy: string;
			contextWindowLimit: number;
			filterByTag: string[];
			excludeByTag: string[];
		};
		embedding: {
			model: string;
			vectorStore: string;
			embedChangedFiles: boolean;
			maxTokensPerChunk: number;
			minChunkSize: number;
			batchSize: number;
			indexingMode: string;
			includeFileTypes: string[];
			excludeFileTypes: string[];
			excludeFolders: string[];
		};
		caching: {
			enabled: boolean;
			cacheSize: number;
		};
		reranking?: {
			enabled: boolean;
			model: string;
		};
		grader: {
			enabled: boolean;
			modelSource: string;
			model: string;
			promptTemplate: string;
			parallelProcessing: number;
			thresholds: {
				relevance: number;
				accuracy: number;
				supportQuality: number;
			};
		};
	};
	search: {
		web: WebSearchConfig;
	};
	prompts: {
		system: SystemPrompt[];
		activeId: string | null;
	};
	agents: {
		list: Agent[];
		activeId: string | null;
		memories: AgentMemory[];
	};
	quickActions?: {
		list: QuickActionConfig[];
		prefix?: string; // Unified prefix (string/emoji) for all quick actions
	};
}

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

	// Phase 5: migrate legacy per-agent tool fields into AgentToolAccess on load.
	// Idempotent — agents that already have toolAccess are left untouched.
	const allCliToolIds: string[] = cliTools.map((c) => c.id);
	migrateAllAgents(agents, allCliToolIds);
	const quickActions = deepClone(source.quickActions?.list ?? DEFAULT_QUICK_ACTIONS);

	const rag = source.rag ?? DEFAULT_USER_CONFIG.rag;
	const retrieval = rag.retrieval ?? DEFAULT_USER_CONFIG.rag.retrieval;
	const embedding = rag.embedding ?? DEFAULT_USER_CONFIG.rag.embedding;
	const caching = rag.caching ?? DEFAULT_USER_CONFIG.rag.caching;
	const grader = rag.grader ?? DEFAULT_USER_CONFIG.rag.grader;
	const thresholds = grader.thresholds ?? DEFAULT_USER_CONFIG.rag.grader.thresholds;
	const reranking = rag.reranking ?? DEFAULT_USER_CONFIG.rag.reranking ?? { enabled: false, model: 'cross-encoder' };

	return {
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
		providers: {
			defaultModel: settings.defaultModel,
			titleSummaryModel: settings.titleSummaryModel,
			list: [] // managed by ProviderRepository; not persisted here
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
				// MCP servers also persist via the per-server repository at
				// data/mcp-servers.json. Writing them here too keeps the unified
				// settings.json schema (Phase 4 design 5.1) honest — anyone
				// inspecting only the config file gets the full picture.
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
			system: [], // managed by PromptRepository; not persisted here
			activeId: settings.activeSystemPromptId ?? null
		},
		agents: {
			list: [], // managed by AgentRepository; not persisted here
			activeId: settings.activeAgentId ?? null,
			memories: [] // managed by AgentRepository; not persisted here
		},
		quickActions: {
			list: deepClone(settings.quickActions ?? DEFAULT_QUICK_ACTIONS),
			prefix: settings.quickActionPrefix ?? '⚡'
		}
	};
}

export interface PluginSettings {
	// LLM Configuration
	llmConfigs: LLMConfig[];
	defaultModel: string;
	titleSummaryModel?: string;
	defaultChatMode: 'chat' | 'agent';

	// Conversation Settings
	conversationTitleMode: string;
	titleSummaryPrompt: string;
	conversationIconEnabled: boolean;
	conversations: Conversation[];
	activeConversationId: string | null;

	// MCP Configuration
	mcpServers: MCPServerConfig[];
	mcpRegistries: MCPRegistry[];

	// Tools Configuration
	builtInTools: BuiltInToolConfig[];
	openApiTools: OpenApiToolConfig[];
	cliTools: CLIToolConfig[];

	// RAG Configuration
	ragConfig: RAGConfig;

	// Web Search Configuration
	webSearchConfig: WebSearchConfig;

	// System Prompts
	systemPrompts: SystemPrompt[];
	activeSystemPromptId: string | null;

	// Agents
	agents: Agent[];
	agentMemories: AgentMemory[];
	activeAgentId: string | null;

	// Quick Actions
	quickActions: QuickActionConfig[];
	quickActionPrefix: string; // Unified prefix (string/emoji) for all quick actions in context menu

}

export const DEFAULT_SETTINGS: PluginSettings = userConfigToPluginSettings(DEFAULT_USER_CONFIG);
