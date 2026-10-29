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

export interface QuickActionConfig {
	id: string;
	name: string;
	enabled: boolean;
	prompt: string;
	model?: string; // If not specified, use default model
	actionType: 'replace' | 'explain';
}

export interface UserConfig {
	version: number;
	lastVersion?: string;
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

export interface PluginSettings {
	// Versioning
	lastVersion: string;

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
