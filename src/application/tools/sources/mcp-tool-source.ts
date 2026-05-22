/**
 * McpToolSource - the tool source for a single MCP server.
 * One instance per MCPServerConfig; load() connects the MCP client, lists
 * the server's tools, and wraps each one; dispose() disconnects the client.
 *
 * Phase 2 scope: this source does not write back the cachedTools cache;
 * that wiring is deferred to a later phase.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { MCPServerConfig } from '@/types/features/mcp';
import { MCPClient } from '@/application/services/mcp-client';
import { MCPToolWrapper } from '@/application/services/mcp-tool-wrapper';

export class McpToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'mcp';
	readonly id: string;
	readonly label: string;

	/** Lazily created on load(); kept so dispose() can release the connection. */
	private client: MCPClient | null = null;

	constructor(private readonly config: MCPServerConfig) {
		this.id = config.name;
		this.label = config.name;
	}

	/**
	 * Connect to the MCP server and wrap every tool it exposes.
	 * A connection or listing failure is allowed to propagate so the
	 * ToolRegistry can isolate this source and keep the others.
	 */
	async load(): Promise<SourceTool[]> {
		const client = new MCPClient(this.config);
		this.client = client;
		await client.connect();
		const mcpTools = await client.listTools();
		return mcpTools.map((mcpTool) => new MCPToolWrapper(mcpTool, client));
	}

	/** Disconnect the MCP client if one was created. */
	async dispose(): Promise<void> {
		if (this.client) {
			await this.client.disconnect();
		}
	}
}
