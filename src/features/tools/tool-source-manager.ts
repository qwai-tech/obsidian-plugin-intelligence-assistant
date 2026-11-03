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
	private readonly runningMcpConfigs = new Map<string, string>();

	constructor(
		readonly registry: ToolRegistry,
		private readonly factory: ToolSourceFactory,
		private readonly settings: () => ToolSourceSettings,
		private readonly update: (change: (settings: ToolSourceSettings) => void) => Promise<void>,
	) {}

	async initialize(): Promise<void> {
		const { openApiTools, cliTools } = this.settings();
		this.registry.registerSource(this.factory.builtin(() => this.enabledBuiltinTypes()));
		for (const config of openApiTools.filter((c) => c.enabled)) {
			this.registry.registerSource(this.factory.openApi(config));
		}
		for (const config of cliTools.filter((c) => c.enabled)) {
			this.registry.registerSource(this.factory.cli(config));
		}
		await this.registry.reload();
		await this.connectAutoMcpServers();
	}

	async resync(): Promise<void> {
		const { openApiTools } = this.settings();
		const enabledApis = new Set(openApiTools.filter((config) => config.enabled).map((config) => config.id));
		for (const id of this.registry.sourceIds('openapi').filter((id) => !enabledApis.has(id))) {
			await this.registry.unregisterSource('openapi', id);
		}
		for (const id of [...enabledApis].filter((id) => !this.registry.hasSource('openapi', id))) {
			await this.reloadOpenApi(id).catch((error: unknown) => console.error(`[OpenAPI] reload failed for ${id}:`, error));
		}
		await this.reloadCli();
		await this.reloadBuiltin();
		await this.syncMcpServers();
	}

	async syncMcpServers(): Promise<void> {
		const enabled = new Map(this.settings().mcpServers.filter((server) => server.enabled).map((server) => [server.name, server]));
		for (const name of this.registry.sourceIds('mcp')) {
			const server = enabled.get(name);
			if (server && mcpLaunchKey(server) === this.runningMcpConfigs.get(name)) {
				continue;
			}
			await this.disconnectMcp(name);
			if (server) {
				try {
					await this.loadMcp(server);
				} catch (error) {
					console.error(`[MCP] Restart failed for ${name}:`, error);
				}
			}
		}
		await this.connectAutoMcpServers();
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
		return (await this.registry.reloadSource('openapi', configId)).length;
	}

	async removeOpenApi(configId: string): Promise<void> {
		await this.registry.unregisterSource('openapi', configId);
	}

	isMcpConnected(serverName: string): boolean {
		return this.registry.hasSource('mcp', serverName);
	}

	async connectMcp(server: MCPServerConfig): Promise<number> {
		return this.loadMcp(server);
	}

	async disconnectMcp(serverName: string): Promise<void> {
		this.runningMcpConfigs.delete(serverName);
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
		return connected > 0;
	}

	private async loadMcp(server: MCPServerConfig): Promise<number> {
		if (!this.isMcpConnected(server.name)) {
			this.registry.registerSource(this.factory.mcp(server));
		}
		let count: number;
		try {
			count = (await this.registry.reloadSource('mcp', server.name)).length;
			this.runningMcpConfigs.set(server.name, mcpLaunchKey(server));
		} catch (error) {
			await this.disconnectMcp(server.name);
			throw error;
		}
		await this.cacheLiveTools(server.name);
		return count;
	}

	private async cacheLiveTools(serverName: string): Promise<void> {
		const tools = this.toolsOf('mcp').filter((t) => t.origin.sourceId === serverName);
		if (tools.length === 0) {
			return;
		}
		const cachedTools = snapshotMcpTools(tools);
		await this.update((settings) => {
			const server = settings.mcpServers.find((candidate) => candidate.name === serverName);
			if (server) {
				server.cachedTools = cachedTools;
				server.cacheTimestamp = Date.now();
			}
		});
	}

	private toolsOf(kind: 'mcp' | 'cli') {
		return this.registry.getTools().filter((t) => t.origin.kind === kind);
	}

	private enabledBuiltinTypes(): string[] {
		return this.settings().builtInTools.filter((t) => t.enabled).map((t) => t.type);
	}
}

function mcpLaunchKey(server: MCPServerConfig): string {
	return JSON.stringify([server.command, server.args ?? [], server.env ?? {}]);
}
