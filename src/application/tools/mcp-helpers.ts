/**
 * MCP helpers that used to live in the now-deleted mcp-service.ts.
 * The logic is the same; the dependency flipped from ToolManager to
 * ToolRegistry.
 */
import type { MCPServerConfig, CachedMCPTool } from '@/types';
import type { RegisteredTool } from '@/types/common/tools';
import type { ToolRegistry } from './tool-registry';
import { McpToolSource } from './sources/mcp-tool-source';

/**
 * Convert a registry tool list to the shape persisted in server.cachedTools.
 * Only the metadata that's needed for offline display is kept.
 */
export function snapshotMcpTools(tools: RegisteredTool[]): CachedMCPTool[] {
	return tools.map((tool) => ({
		name: tool.definition.name,
		description: tool.definition.description,
		inputSchema: extractInputSchema(tool),
	}));
}

/**
 * Connect every enabled, auto-mode MCP server that isn't already registered,
 * write back cachedTools for newly-connected ones, and persist on change.
 * Returns true if any new connections were made (so the caller can refresh UI).
 */
export async function ensureAutoConnectedMcpServers(
	servers: MCPServerConfig[],
	registry: ToolRegistry,
	onSettingsUpdate: (servers: MCPServerConfig[]) => Promise<void>,
): Promise<boolean> {
	let settingsDirty = false;
	let connectionsChanged = false;

	for (const server of servers) {
		if (!server.enabled) continue;
		if ((server.connectionMode ?? 'auto') !== 'auto') continue;
		if (registry.hasSource('mcp', server.name)) continue;

		try {
			registry.registerSource(new McpToolSource(server));
			const tools = await registry.reloadSource('mcp', server.name);
			connectionsChanged = true;

			if (tools.length > 0) {
				server.cachedTools = snapshotMcpTools(tools);
				server.cacheTimestamp = Date.now();
				settingsDirty = true;
			}
			console.debug(`[MCP] Successfully initialized server: ${server.name} (${tools.length} tools)`);
		} catch (err) {
			console.error(`[MCP] Auto-connect failed for ${server.name}:`, err);
		}
	}

	if (settingsDirty) {
		await onSettingsUpdate(servers);
	}

	return connectionsChanged;
}

/** Stats shown in the settings UI summary. */
export function getMCPStats(servers: MCPServerConfig[]): {
	totalServers: number;
	enabledServers: number;
	connectedServers: number;
	totalTools: number;
} {
	const enabled = servers.filter((s) => s.enabled);
	const connected = enabled.filter((s) => s.cachedTools && s.cachedTools.length > 0);
	const totalTools = connected.reduce((sum, s) => sum + (s.cachedTools?.length ?? 0), 0);
	return {
		totalServers: servers.length,
		enabledServers: enabled.length,
		connectedServers: connected.length,
		totalTools,
	};
}

/** RegisteredTool doesn't carry a raw JSON-schema input shape, so we reassemble it. */
function extractInputSchema(tool: RegisteredTool): CachedMCPTool['inputSchema'] {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const param of tool.definition.parameters) {
		properties[param.name] = {
			type: param.type,
			description: param.description,
			...(param.enum ? { enum: param.enum } : {}),
		};
		if (param.required) required.push(param.name);
	}
	return { type: 'object', properties, required };
}
