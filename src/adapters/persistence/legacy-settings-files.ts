import type { DataAdapter } from 'obsidian';
import type { Agent, SystemPrompt } from '@/features/agent';
import type { LLMConfig } from '@/features/llm';
import type { StoredUnits, UserConfig } from '@/features/settings';
import type { MCPServerConfig } from '@/features/tools';
import type { PluginPaths } from '@/core/plugin-paths';
import { JsonCollection } from './json-collection';
import { JsonFile } from './json-file';

export interface LegacySettings {
	found: boolean;
	userConfig: UserConfig | null;
	stored: Partial<StoredUnits & { mcpServers: MCPServerConfig[] }>;
}

export class LegacySettingsFiles {
	private readonly userConfig: JsonFile<UserConfig | null>;
	private readonly providers: JsonFile<{ providers?: LLMConfig[] } | null>;
	private readonly mcpServers: JsonFile<{ servers?: MCPServerConfig[] } | null>;
	private readonly prompts: JsonCollection<SystemPrompt>;
	private readonly agents: JsonCollection<Agent>;

	constructor(private readonly adapter: DataAdapter, private readonly paths: PluginPaths) {
		this.userConfig = new JsonFile<UserConfig | null>(adapter, paths.userConfig, () => null);
		this.providers = new JsonFile<{ providers?: LLMConfig[] } | null>(adapter, paths.providers, () => null);
		this.mcpServers = new JsonFile<{ servers?: MCPServerConfig[] } | null>(adapter, paths.mcpServers, () => null);
		this.prompts = new JsonCollection<SystemPrompt>(adapter, paths.prompts, 'prompts');
		this.agents = new JsonCollection<Agent>(adapter, paths.agents, 'agents');
	}

	async read(): Promise<LegacySettings> {
		const [userConfig, providers, mcpServers, prompts, agents] = await Promise.all([
			this.userConfig.read(),
			this.providers.read(),
			this.mcpServers.read(),
			this.prompts.load(),
			this.agents.load(),
		]);
		const stored: LegacySettings['stored'] = {};
		if (providers?.providers?.length) {
			stored.llmConfigs = providers.providers;
		}
		if (prompts.items.length > 0) {
			stored.systemPrompts = prompts.items;
			stored.activeSystemPromptId = prompts.activeId;
		}
		if (agents.items.length > 0) {
			stored.agents = agents.items;
			stored.activeAgentId = agents.activeId;
		}
		if (mcpServers?.servers?.length) {
			stored.mcpServers = mcpServers.servers;
		}
		const found = userConfig !== null || providers !== null || mcpServers !== null || prompts.indexExists || agents.indexExists;
		return { found, userConfig, stored };
	}

	async remove(): Promise<void> {
		for (const file of [this.paths.userConfig, this.paths.providers, this.paths.mcpServers]) {
			if (await this.adapter.exists(file)) {
				await this.adapter.remove(file);
			}
		}
		for (const folder of [this.paths.prompts, this.paths.agents]) {
			if (await this.adapter.exists(folder)) {
				await this.adapter.rmdir(folder, true);
			}
		}
	}
}
