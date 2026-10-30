import type { Agent, SystemPrompt } from '@/features/agent';
import type { LLMConfig } from '@/features/llm';
import type { PluginSettings, UserConfig } from '@/features/settings/types/settings';
import { pluginSettingsToUserConfig } from './settings-codec';

const FORMAT = 2;

export interface SettingsDocument {
	format: typeof FORMAT;
	config: UserConfig;
	providers: LLMConfig[];
	prompts: { list: SystemPrompt[]; activeId: string | null };
	agents: { list: Agent[]; activeId: string | null };
}

export type StoredUnits = Pick<PluginSettings, 'llmConfigs' | 'systemPrompts' | 'activeSystemPromptId' | 'agents' | 'activeAgentId'>;

export function isSettingsDocument(value: unknown): value is SettingsDocument {
	return typeof value === 'object' && value !== null && (value as { format?: unknown }).format === FORMAT;
}

export function toSettingsDocument(settings: PluginSettings): SettingsDocument {
	const config = pluginSettingsToUserConfig(settings);
	config.tools.mcp.servers = config.tools.mcp.servers.map(({ cachedTools: _tools, cacheTimestamp: _at, ...server }) => server);
	return {
		format: FORMAT,
		config,
		providers: settings.llmConfigs.map(({ cachedModels: _models, cacheTimestamp: _at, ...provider }) => provider),
		prompts: { list: settings.systemPrompts, activeId: settings.activeSystemPromptId ?? null },
		agents: { list: settings.agents, activeId: settings.activeAgentId ?? null },
	};
}

export function fromSettingsDocument(document: SettingsDocument): { userConfig: UserConfig; stored: StoredUnits } {
	return {
		userConfig: document.config,
		stored: {
			llmConfigs: document.providers ?? [],
			systemPrompts: document.prompts?.list ?? [],
			activeSystemPromptId: document.prompts?.activeId ?? null,
			agents: document.agents?.list ?? [],
			activeAgentId: document.agents?.activeId ?? null,
		},
	};
}
