import { App } from 'obsidian';
import type { PluginPaths } from '@/core/plugin-paths';
import type { MCPServerConfig } from '@/features/tools';
import { ModelCacheRepository } from '@/adapters/persistence/data/model-cache-repository';
import { McpToolCacheRepository } from '@/adapters/persistence/data/mcp-tool-cache-repository';
import { TokenUsageRepository } from '@/adapters/persistence/data/token-usage-repository';
import { AgentMemoryRepository } from '@/adapters/persistence/data/agent-memory-repository';

export class PluginDataService {
	modelCacheRepository!: ModelCacheRepository;
	private mcpToolCacheRepository!: McpToolCacheRepository;
	tokenUsageRepo!: TokenUsageRepository;
	agentMemoryRepo!: AgentMemoryRepository;

	constructor(private readonly app: App, private readonly paths: PluginPaths) {}

	initialize(): void {
		this.modelCacheRepository = new ModelCacheRepository(this.app, this.paths.modelCache);
		this.mcpToolCacheRepository = new McpToolCacheRepository(this.app, this.paths.mcpToolsCache);
		this.tokenUsageRepo = new TokenUsageRepository(this.app, this.paths.tokenUsage);
		this.agentMemoryRepo = new AgentMemoryRepository(this.app, this.paths.agentMemory);
	}

	async applyMcpToolCaches(servers: MCPServerConfig[]): Promise<void> {
		const caches = await this.mcpToolCacheRepository.loadAll();
		for (const server of servers) {
			const cache = caches[server.name];
			if (cache) {
				server.cachedTools = cache.tools;
				server.cacheTimestamp = cache.updatedAt;
			}
		}
	}

	async persistMcpToolCaches(servers: MCPServerConfig[]): Promise<void> {
		await Promise.all(
			servers.map(server =>
				this.mcpToolCacheRepository.save(server.name, server.cachedTools ?? [], server.cacheTimestamp)
			)
		);
	}
}
