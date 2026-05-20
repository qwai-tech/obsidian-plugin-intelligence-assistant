/**
 * SettingsService
 * Provides typed access to plugin settings for the presentation layer.
 * Presentation code should read settings through this service rather than
 * directly mutating plugin.settings, keeping infrastructure concerns isolated.
 */

import type {
	LLMConfig,
	RAGConfig,
	WebSearchConfig,
	SystemPrompt,
	Agent,
	AgentMemory,
	MCPServerConfig,
	BuiltInToolConfig,
} from '@/types';
import type { QuickActionConfig } from '@/types/settings';

export interface ISettingsService {
	// Read
	getDefaultModel(): string;
	getLLMConfigs(): LLMConfig[];
	getRagConfig(): RAGConfig;
	getWebSearchConfig(): WebSearchConfig;
	getSystemPrompts(): SystemPrompt[];
	getActiveSystemPromptId(): string | null;
	getAgents(): Agent[];
	getActiveAgentId(): string | null;
	getAgentMemories(): AgentMemory[];
	getMcpServers(): MCPServerConfig[];
	getBuiltInTools(): BuiltInToolConfig[];
	getQuickActions(): QuickActionConfig[];
	getDefaultChatMode(): 'chat' | 'agent';
	getConversationIconEnabled(): boolean;

	// Write (all mutations go through saveSettings)
	setDefaultModel(model: string): Promise<void>;
	setActiveSystemPromptId(id: string | null): Promise<void>;
	setActiveAgentId(id: string | null): Promise<void>;
}

export class SettingsService implements ISettingsService {
	constructor(
		private readonly getSettings: () => {
			defaultModel: string;
			llmConfigs: LLMConfig[];
			ragConfig: RAGConfig;
			webSearchConfig: WebSearchConfig;
			systemPrompts: SystemPrompt[];
			activeSystemPromptId: string | null;
			agents: Agent[];
			activeAgentId: string | null;
			agentMemories: AgentMemory[];
			mcpServers: MCPServerConfig[];
			builtInTools: BuiltInToolConfig[];
			quickActions: QuickActionConfig[];
			defaultChatMode: 'chat' | 'agent';
			conversationIconEnabled: boolean;
		},
		private readonly save: () => Promise<void>
	) {}

	getDefaultModel(): string { return this.getSettings().defaultModel; }
	getLLMConfigs(): LLMConfig[] { return this.getSettings().llmConfigs; }
	getRagConfig(): RAGConfig { return this.getSettings().ragConfig; }
	getWebSearchConfig(): WebSearchConfig { return this.getSettings().webSearchConfig; }
	getSystemPrompts(): SystemPrompt[] { return this.getSettings().systemPrompts; }
	getActiveSystemPromptId(): string | null { return this.getSettings().activeSystemPromptId; }
	getAgents(): Agent[] { return this.getSettings().agents; }
	getActiveAgentId(): string | null { return this.getSettings().activeAgentId; }
	getAgentMemories(): AgentMemory[] { return this.getSettings().agentMemories; }
	getMcpServers(): MCPServerConfig[] { return this.getSettings().mcpServers; }
	getBuiltInTools(): BuiltInToolConfig[] { return this.getSettings().builtInTools; }
	getQuickActions(): QuickActionConfig[] { return this.getSettings().quickActions; }
	getDefaultChatMode(): 'chat' | 'agent' { return this.getSettings().defaultChatMode; }
	getConversationIconEnabled(): boolean { return this.getSettings().conversationIconEnabled; }

	async setDefaultModel(model: string): Promise<void> {
		this.getSettings().defaultModel = model;
		await this.save();
	}

	async setActiveSystemPromptId(id: string | null): Promise<void> {
		this.getSettings().activeSystemPromptId = id;
		await this.save();
	}

	async setActiveAgentId(id: string | null): Promise<void> {
		this.getSettings().activeAgentId = id;
		await this.save();
	}
}
