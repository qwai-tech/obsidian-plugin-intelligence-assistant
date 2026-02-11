/**
 * Agent Core Types
 * Domain types for AI agents and system prompts
 */

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
	enabledBuiltInTools: string[];
	enabledMcpServers: string[];
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
	reactEnabled: boolean;
	reactMaxSteps: number;
	reactAutoContinue: boolean;
	createdAt: number;
	updatedAt: number;
}
