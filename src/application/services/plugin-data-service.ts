// src/application/services/plugin-data-service.ts
import { App } from 'obsidian';
import type { PluginSettings, LLMConfig, SystemPrompt, Agent, MCPServerConfig } from '@/types';
import {
	AgentRepository,
	PromptRepository,
	ModelCacheRepository,
	ProviderRepository,
	McpServerRepository,
	McpToolCacheRepository,
	TokenUsageRepository,
} from '@/infrastructure/persistence';

export interface HydrateResult {
	llmConfigs?: LLMConfig[];
	systemPrompts?: SystemPrompt[];
	activeSystemPromptId?: string | null;
	agents?: Agent[];
	activeAgentId?: string | null;
	mcpServers?: MCPServerConfig[];
}

export class PluginDataService {
	private promptRepository!: PromptRepository;
	private agentRepository!: AgentRepository;
	private modelCacheRepository!: ModelCacheRepository;
	private providerRepository!: ProviderRepository;
	private mcpServerRepository!: McpServerRepository;
	private mcpToolCacheRepository!: McpToolCacheRepository;
	public tokenUsageRepo!: TokenUsageRepository;

	constructor(private readonly app: App) {}

	async initialize(): Promise<void> {
		this.promptRepository = new PromptRepository(this.app);
		this.agentRepository = new AgentRepository(this.app);
		this.modelCacheRepository = new ModelCacheRepository(this.app);
		this.providerRepository = new ProviderRepository(this.app);
		this.mcpServerRepository = new McpServerRepository(this.app);
		this.mcpToolCacheRepository = new McpToolCacheRepository(this.app);
		this.tokenUsageRepo = new TokenUsageRepository(this.app);

		await Promise.all([
			this.promptRepository.initialize(),
			this.agentRepository.initialize(),
			this.modelCacheRepository.initialize(),
			this.providerRepository.initialize(),
			this.mcpServerRepository.initialize(),
			this.mcpToolCacheRepository.initialize(),
			this.tokenUsageRepo.initialize(),
		]);
	}

	/**
	 * Hydrate settings from repositories.
	 * If a repo has data: returns it (repo is authoritative).
	 * If a repo is empty but settings has data: saves settings to repo (first-time migration).
	 * Returns a partial settings object with only the fields that were loaded from repos.
	 */
	async hydrateAll(settings: PluginSettings): Promise<HydrateResult> {
		const result: HydrateResult = {};

		// Providers
		const providers = await this.providerRepository.loadAll();
		if (providers.length > 0) {
			result.llmConfigs = providers;
		} else if (settings.llmConfigs?.length) {
			await this.providerRepository.saveAll(settings.llmConfigs);
		}

		// Prompts
		const { prompts, activeId: promptActiveId } = await this.promptRepository.loadAll();
		if (prompts.length > 0) {
			result.systemPrompts = prompts;
			result.activeSystemPromptId = promptActiveId;
		} else if (settings.systemPrompts?.length) {
			await this.promptRepository.saveAll(settings.systemPrompts, settings.activeSystemPromptId ?? null);
		}

		// Agents
		const { agents, activeId: agentActiveId } = await this.agentRepository.loadAll();
		if (agents.length > 0) {
			result.agents = agents;
			result.activeAgentId = agentActiveId;
		} else if (settings.agents?.length) {
			await this.agentRepository.saveAll(settings.agents, settings.activeAgentId ?? null);
		}

		// Model cache (mutates configs in-place — no return value needed)
		await this.modelCacheRepository.applyCacheToConfigs(settings.llmConfigs ?? []);

		// MCP servers
		const mcpServers = await this.mcpServerRepository.loadAll();
		if (mcpServers.length > 0) {
			const cacheMap = await this.mcpToolCacheRepository.loadAll();
			for (const server of mcpServers) {
				const cache = cacheMap[server.name];
				if (cache) {
					server.cachedTools = cache.tools;
					server.cacheTimestamp = cache.updatedAt;
				}
			}
			result.mcpServers = mcpServers;
		} else if (settings.mcpServers?.length) {
			await this.mcpServerRepository.saveAll(settings.mcpServers);
			await this.persistMcpToolCaches(settings.mcpServers);
		}

		return result;
	}

	async persistAll(settings: PluginSettings): Promise<void> {
		await Promise.all([
			this.promptRepository.saveAll(settings.systemPrompts ?? [], settings.activeSystemPromptId ?? null),
			this.agentRepository.saveAll(settings.agents ?? [], settings.activeAgentId ?? null),
			this.modelCacheRepository.saveFromConfigs(settings.llmConfigs ?? []),
			this.providerRepository.saveAll(settings.llmConfigs ?? []),
			this.mcpServerRepository.saveAll(settings.mcpServers ?? []),
			this.persistMcpToolCaches(settings.mcpServers ?? []),
		]);
	}

	async persistMcpToolCaches(servers: MCPServerConfig[]): Promise<void> {
		await Promise.all(
			servers.map(server =>
				this.mcpToolCacheRepository.save(server.name, server.cachedTools ?? [], server.cacheTimestamp)
			)
		);
	}
}
