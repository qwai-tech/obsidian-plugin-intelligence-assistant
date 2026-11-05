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
		providers: settings.llmConfigs.map(toStoredProvider),
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

export function applyDisabledModels(configs: LLMConfig[]): void {
	for (const config of configs) {
		const disabled = new Set(config.disabledModels ?? []);
		for (const model of config.cachedModels ?? []) {
			if (disabled.has(model.id)) model.enabled = false;
		}
	}
}

function toStoredProvider({ cachedModels, cacheTimestamp: _at, disabledModels, ...provider }: LLMConfig): LLMConfig {
	const cached = cachedModels ?? [];
	const cachedIds = new Set(cached.map((model) => model.id));
	const disabled = [
		...(disabledModels ?? []).filter((id) => !cachedIds.has(id)),
		...cached.filter((model) => model.enabled === false).map((model) => model.id),
	];
	return disabled.length > 0 ? { ...provider, disabledModels: disabled } : provider;
}

/** Reject malformed/future documents before migration can save defaults over them. */
export function assertSettingsDocument(value: unknown): asserts value is SettingsDocument {
	if (!isSettingsDocument(value)) throw new Error('Unsupported settings document format');
	const object = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item));
	if (!object(value.config) || !Array.isArray(value.providers) || !object(value.prompts) || !Array.isArray(value.prompts.list) || !object(value.agents) || !Array.isArray(value.agents.list)) {
		throw new Error('Invalid settings document; existing data was preserved');
	}
	if (value.config.version !== 1 || !object(value.config.providers) || !object(value.config.conversations) || !object(value.config.tools) || !object(value.config.rag) || !object(value.config.search)) throw new Error('Invalid or unsupported settings configuration; existing data was preserved');
	if (value.providers.some(provider => !object(provider) || typeof provider.provider !== 'string') || value.agents.list.some(agent => !object(agent) || typeof agent.id !== 'string') || value.prompts.list.some(prompt => !object(prompt) || typeof prompt.id !== 'string')) {
		throw new Error('Invalid stored provider, agent or prompt; existing data was preserved');
	}
}
