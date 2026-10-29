import type { ToolRegistry } from './tool-registry';
import type { ToolSource } from './tool-source';
import { snapshotMcpTools } from './mcp-helpers';
import { errorMessage } from '@/core/utils/errors';
import type { BuiltInToolConfig } from '@/features/tools/types/tools';
import type { CachedMCPTool, MCPServerConfig } from '@/features/tools/types/mcp';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';
import type { CLIToolConfig } from '@/features/tools/types/cli-tools';

export interface ToolSourceSettings {
	builtInTools: BuiltInToolConfig[];
	mcpServers: MCPServerConfig[];
	openApiTools: OpenApiToolConfig[];
	cliTools: CLIToolConfig[];
}

export interface OpenApiLoadOptions {
	refetch?: boolean;
}

export interface McpRefreshResult {
	server: string;
	tools: number;
	error?: string;
}

export interface ToolSourceFactory {
	builtin(enabledTypes: () => string[]): ToolSource;
	mcp(server: MCPServerConfig): ToolSource;
	openApi(config: OpenApiToolConfig, options?: OpenApiLoadOptions): ToolSource;
	cli(config: CLIToolConfig): ToolSource;
}

export class ToolSourceManager {
	constructor(
		readonly registry: ToolRegistry,
		private readonly factory: ToolSourceFactory,
		private readonly settings: () => ToolSourceSettings,
		private readonly persist: () => Promise<void>,
	) {}

	async initialize(): Promise<void> {
		const { mcpServers, openApiTools, cliTools } = this.settings();
		this.registry.registerSource(this.factory.builtin(() => this.enabledBuiltinTypes()));
		for (const server of mcpServers.filter((s) => s.enabled)) {
			this.registry.registerSource(this.factory.mcp(server));
		}
		for (const config of openApiTools.filter((c) => c.enabled)) {
			this.registry.registerSource(this.factory.openApi(config));
		}
		for (const config of cliTools.filter((c) => c.enabled)) {
			this.registry.registerSource(this.factory.cli(config));
		}
		await this.registry.reload();

		const cached = mcpServers.filter((server) => server.enabled && this.cacheLiveTools(server));
		if (cached.length > 0) {
			await this.persist();
		}
	}

	async reloadBuiltin(): Promise<void> {
		if (this.registry.hasSource('builtin', 'builtin')) {
			await this.registry.reloadSource('builtin', 'builtin');
		}
	}

	async reloadCli(): Promise<void> {
		const liveIds = new Set(this.toolsOf('cli').map((t) => t.origin.sourceId));
		for (const id of liveIds) {
			await this.registry.unregisterSource('cli', id);
		}
		for (const config of this.settings().cliTools.filter((c) => c.enabled)) {
			this.registry.registerSource(this.factory.cli(config));
			try {
				await this.registry.reloadSource('cli', config.id);
			} catch (error) {
				console.error(`[CLI] reload failed for ${config.id}:`, error);
			}
		}
	}

	async reloadOpenApi(configId: string, options: OpenApiLoadOptions = {}): Promise<number> {
		await this.registry.unregisterSource('openapi', configId);
		const config = this.settings().openApiTools.find((c) => c.id === configId);
		if (!config?.enabled) {
			return 0;
		}
		this.registry.registerSource(this.factory.openApi(config, options));
		try {
			return (await this.registry.reloadSource('openapi', configId)).length;
		} catch (error) {
			console.error(`[OpenAPI] reload failed for ${configId}:`, error);
			return 0;
		}
	}

	async removeOpenApi(configId: string): Promise<void> {
		await this.registry.unregisterSource('openapi', configId);
	}

	isMcpConnected(serverName: string): boolean {
		return this.registry.hasSource('mcp', serverName);
	}

	async connectMcp(server: MCPServerConfig): Promise<number> {
		const count = await this.loadMcp(server);
		await this.persist();
		return count;
	}

	async disconnectMcp(serverName: string): Promise<void> {
		await this.registry.unregisterSource('mcp', serverName);
	}

	async refreshMcpServers(): Promise<McpRefreshResult[]> {
		const results: McpRefreshResult[] = [];
		for (const server of this.settings().mcpServers.filter((s) => s.enabled)) {
			try {
				results.push({ server: server.name, tools: await this.loadMcp(server) });
			} catch (error) {
				results.push({ server: server.name, tools: 0, error: errorMessage(error) });
			}
		}
		await this.persist();
		return results;
	}

	async probeMcp(server: MCPServerConfig): Promise<CachedMCPTool[]> {
		const source = this.factory.mcp(server);
		try {
			const tools = await source.load();
			return tools.map((tool) => ({ name: tool.definition.name, description: tool.definition.description }));
		} finally {
			await source.dispose();
		}
	}

	async connectAutoMcpServers(): Promise<boolean> {
		const pending = this.settings().mcpServers.filter((server) =>
			server.enabled && (server.connectionMode ?? 'auto') === 'auto' && !this.isMcpConnected(server.name),
		);
		let connected = 0;
		for (const server of pending) {
			try {
				await this.loadMcp(server);
				connected++;
			} catch (error) {
				console.error(`[MCP] Auto-connect failed for ${server.name}:`, error);
			}
		}
		if (connected > 0) {
			await this.persist();
		}
		return connected > 0;
	}

	private async loadMcp(server: MCPServerConfig): Promise<number> {
		if (!this.isMcpConnected(server.name)) {
			this.registry.registerSource(this.factory.mcp(server));
		}
		const tools = await this.registry.reloadSource('mcp', server.name);
		this.cacheLiveTools(server);
		return tools.length;
	}

	private cacheLiveTools(server: MCPServerConfig): boolean {
		const tools = this.toolsOf('mcp').filter((t) => t.origin.sourceId === server.name);
		if (tools.length === 0) {
			return false;
		}
		server.cachedTools = snapshotMcpTools(tools);
		server.cacheTimestamp = Date.now();
		return true;
	}

	private toolsOf(kind: 'mcp' | 'cli') {
		return this.registry.getTools().filter((t) => t.origin.kind === kind);
	}

	private enabledBuiltinTypes(): string[] {
		return this.settings().builtInTools.filter((t) => t.enabled).map((t) => t.type);
	}
}
