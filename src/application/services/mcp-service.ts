/**
 * MCP Service
 * Centralized service for managing Model Context Protocol (MCP) server connections
 */

import type { MCPServerConfig, CachedMCPTool } from '@/types';
import type { ToolManager } from '@/application/services/tool-manager';
import type { MCPTool } from '@/application/services/mcp-client';

/**
 * Convert MCP tools to cached format for storage
 */
export function snapshotMcpTools(tools: MCPTool[]): CachedMCPTool[] {
	return tools.map(tool => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema
	}));
}

/**
 * Initialize auto-connect MCP servers
 * Returns true if any connections were made, false otherwise
 */
export async function ensureAutoConnectedMcpServers(
	servers: MCPServerConfig[],
	toolManager: ToolManager,
	onSettingsUpdate: (servers: MCPServerConfig[]) => Promise<void>
): Promise<boolean> {
	const connected = new Set(toolManager.getMCPServers());
	let settingsDirty = false;
	let connectionsChanged = false;

	for (const server of servers) {
		// Skip disabled servers
		if (!server.enabled) {
			continue;
		}

		// Skip non-auto servers
		if ((server.connectionMode ?? 'auto') !== 'auto') {
			continue;
		}

		// Skip already connected servers
		if (connected.has(server.name)) {
			continue;
		}

		try {
			const tools = await toolManager.registerMCPServer(server);
			connectionsChanged = true;

			if (tools.length > 0) {
				server.cachedTools = snapshotMcpTools(tools);
				server.cacheTimestamp = Date.now();
				settingsDirty = true;
			}

			connected.add(server.name);
			console.debug(`[MCP] Successfully initialized server: ${server.name} (${tools.length} tools)`);
		} catch (error) {
			console.error(`[MCP] Auto-connect failed for ${server.name}:`, error);
		}
	}

	// Save updated cache if needed
	if (settingsDirty) {
		await onSettingsUpdate(servers);
	}

	return connectionsChanged;
}

/**
 * Initialize MCP servers (auto-connect only)
 * Similar to ensureAutoConnectedMcpServers but with simpler interface
 */
export async function initializeMCPServers(
	servers: MCPServerConfig[],
	toolManager: ToolManager,
	onSettingsUpdate: (servers: MCPServerConfig[]) => Promise<void>
): Promise<void> {
	await ensureAutoConnectedMcpServers(servers, toolManager, onSettingsUpdate);
}

/**
 * Get MCP connection statistics
 */
export function getMCPStats(servers: MCPServerConfig[]): {
	totalServers: number;
	enabledServers: number;
	connectedServers: number;
	totalTools: number;
} {
	const enabledServers = servers.filter(s => s.enabled);
	const connectedServers = enabledServers.filter(s => s.cachedTools && s.cachedTools.length > 0);
	const totalTools = connectedServers.reduce((sum, s) => sum + (s.cachedTools?.length || 0), 0);

	return {
		totalServers: servers.length,
		enabledServers: enabledServers.length,
		connectedServers: connectedServers.length,
		totalTools
	};
}
