/**
 * Agent Core Types
 * Domain types for AI agents and system prompts
 */

import type { AgentToolAccess } from '@/types/common/tools';

export interface SystemPrompt {
	id: string;
	name: string;
	content: string;
	enabled: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface AgentModelStrategy {
  strategy: 'fixed' | 'chat-view' | 'default';
  modelId?: string; // Only used when strategy is 'fixed'
}

export interface Agent {
	id: string;
	name: string;
	description: string;
	icon: string;
	modelStrategy: AgentModelStrategy;
	temperature: number;
	maxTokens: number;
	systemPromptId: string;
	contextWindow: number;
	/**
	 * Per-agent tool access. The source of truth for what tools an agent
	 * can use. New code reads only this.
	 */
	toolAccess: AgentToolAccess;
	// ── Legacy per-source enable lists from before the unified tool registry.
	// Optional so configs persisted by older builds still load;
	// userConfigToPluginSettings migrates them into `toolAccess` at load
	// time via migrateAllAgents. The agent-edit-modal still uses these as
	// its UI working state and recomputes toolAccess on save. Do not add
	// new readers outside the migration + modal — use `toolAccess`.
	enabledBuiltInTools?: string[];
	enabledMcpServers?: string[];
	enabledMcpTools?: string[];
	enabledCLITools?: string[];
	enabledAllCLITools?: boolean;
	memoryType: 'short-term' | 'long-term' | 'none';
	memoryConfig: {
		summaryInterval: number;
		maxMemories: number;
	};
	ragEnabled: boolean;
	webSearchEnabled: boolean;
	maxSteps: number;
	createdAt: number;
	updatedAt: number;
}
