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
import type { SystemPrompt, Agent } from './core/agent';
import type { AgentMemory } from './features/memory';
import * as defaultUserConfigJson from '../../config/default/settings.json';

const DEFAULT_USER_CONFIG: UserConfig = defaultUserConfigJson as UserConfig;
const DEFAULT_TITLE_PROMPT = 'Generate a short, descriptive title (max 6 words) for this conversation:\n\n{conversation}\n\nTitle:';
const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
	mcp: {
		servers: MCPServerConfig[];
		registries: MCPRegistry[];
	};
	tools: {
		builtIn: BuiltInToolConfig[];
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
	const mcpServers = deepClone(source.mcp?.servers ?? DEFAULT_USER_CONFIG.mcp.servers);
	const mcpRegistries = deepClone(source.mcp?.registries ?? DEFAULT_USER_CONFIG.mcp.registries);
	const builtInTools = deepClone(source.tools?.builtIn ?? DEFAULT_USER_CONFIG.tools.builtIn);
	const webSearch = deepClone(source.search?.web ?? DEFAULT_USER_CONFIG.search.web);
	const agents = deepClone(source.agents?.list ?? []);
	const agentMemories = deepClone(source.agents?.memories ?? []);

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
		activeAgentId: source.agents?.activeId ?? null
	};
}

export function pluginSettingsToUserConfig(settings: PluginSettings): UserConfig {
	return {
		version: DEFAULT_USER_CONFIG.version,
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
		mcp: {
			servers: [],
			registries: deepClone(settings.mcpRegistries ?? [])
		},
		tools: {
			builtIn: deepClone(settings.builtInTools ?? [])
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
			system: deepClone(settings.systemPrompts ?? []),
			activeId: settings.activeSystemPromptId ?? null
		},
		agents: {
			list: deepClone(settings.agents ?? []),
			activeId: settings.activeAgentId ?? null,
			memories: deepClone(settings.agentMemories ?? [])
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

}

export const DEFAULT_SETTINGS: PluginSettings = userConfigToPluginSettings(DEFAULT_USER_CONFIG);
