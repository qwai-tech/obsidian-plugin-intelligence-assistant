import { App } from 'obsidian';
import { withoutProviderKeys, type PersistUnit, type PluginSettings } from '@/features/settings';
import type { LLMConfig } from '@/features/llm';
import type { SystemPrompt, Agent } from '@/features/agent';
import type { MCPServerConfig } from '@/features/tools';
import { AgentRepository } from '@/adapters/persistence/data/agent-repository';
import { BUILTIN_AGENT_PRESETS } from '@/features/agent';
import { PromptRepository } from '@/adapters/persistence/data/prompt-repository';
import { ModelCacheRepository } from '@/adapters/persistence/data/model-cache-repository';
import { ProviderRepository } from '@/adapters/persistence/data/provider-repository';
import { McpServerRepository } from '@/adapters/persistence/data/mcp-server-repository';
import { McpToolCacheRepository } from '@/adapters/persistence/data/mcp-tool-cache-repository';
import { TokenUsageRepository } from '@/adapters/persistence/data/token-usage-repository';
import { AgentMemoryRepository } from '@/adapters/persistence/data/agent-memory-repository';

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
	public agentMemoryRepo!: AgentMemoryRepository;

	constructor(private readonly app: App) {}

	async initialize(): Promise<void> {
		this.promptRepository = new PromptRepository(this.app);
		this.agentRepository = new AgentRepository(this.app, BUILTIN_AGENT_PRESETS);
		this.modelCacheRepository = new ModelCacheRepository(this.app);
		this.providerRepository = new ProviderRepository(this.app);
		this.mcpServerRepository = new McpServerRepository(this.app);
		this.mcpToolCacheRepository = new McpToolCacheRepository(this.app);
		this.tokenUsageRepo = new TokenUsageRepository(this.app);
		this.agentMemoryRepo = new AgentMemoryRepository(this.app);

		await Promise.all([
			this.agentRepository.initialize(),
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
			await this.providerRepository.saveAll(withoutProviderKeys(settings.llmConfigs));
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

	async persist(settings: PluginSettings, units: ReadonlySet<PersistUnit>): Promise<void> {
		const writes: Array<Promise<void>> = [];
		if (units.has('providers')) {
			writes.push(
				this.modelCacheRepository.saveFromConfigs(settings.llmConfigs ?? []),
				this.providerRepository.saveAll(settings.llmConfigs ?? []),
			);
		}
		if (units.has('prompts')) {
			writes.push(this.promptRepository.saveAll(settings.systemPrompts ?? [], settings.activeSystemPromptId ?? null));
		}
		if (units.has('agents')) {
			writes.push(this.agentRepository.saveAll(settings.agents ?? [], settings.activeAgentId ?? null));
		}
		if (units.has('mcp')) {
			writes.push(
				this.mcpServerRepository.saveAll(settings.mcpServers ?? []),
				this.persistMcpToolCaches(settings.mcpServers ?? []),
			);
		}
		await Promise.all(writes);
	}

	async persistMcpToolCaches(servers: MCPServerConfig[]): Promise<void> {
		await Promise.all(
			servers.map(server =>
				this.mcpToolCacheRepository.save(server.name, server.cachedTools ?? [], server.cacheTimestamp)
			)
		);
	}
}
