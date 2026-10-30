import { App, Notice } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import type { CachedMCPTool, MCPServerConfig } from '@/features/tools';
import { t } from '@/i18n';
import { MCPServerModal } from '@/ui/modals/mcp-server-modal';

export async function testAllMcpConnections(plugin: PluginHost): Promise<void> {
	const mcpServers = plugin.settings.mcpServers;

	if (mcpServers.length === 0) {
		new Notice(t('settings.mcp.notices.noServersConfigured'));
		return;
	}

	new Notice(t('settings.mcp.notices.testingAll', { count: mcpServers.length }));

	const results: {name: string, success: boolean, error?: string}[] = [];
	const probed = new Map<string, CachedMCPTool[]>();

	for (const server of mcpServers) {
		if (!server.enabled) {
			results.push({ name: server.name, success: false, error: 'Server disabled' });
			continue;
		}

		try {
			probed.set(server.name, await plugin.services.tools.probeMcp(server));

			results.push({
				name: server.name,
				success: true,
				error: undefined
			});
		} catch (error: unknown) {
			console.error(`[MCP] ${server.name} connection test failed:`, error);
			results.push({
				name: server.name,
				success: false,
				error: error instanceof Error ? error.message : 'Connection failed'
			});
		}
	}

	if (probed.size > 0) {
		await plugin.updateSettings((settings) => {
			for (const server of settings.mcpServers) {
				const tools = probed.get(server.name);
				if (tools) {
					server.cachedTools = tools;
					server.cacheTimestamp = Date.now();
				}
			}
		});
	}

	// Show results
	const successful = results.filter(r => r.success).length;
	const failed = results.filter(r => !r.success).length;

	if (failed === 0) {
		new Notice(t('settings.mcp.notices.testAllSuccess', { count: successful }));
	} else {
		new Notice(t('settings.mcp.notices.testAllPartial', { successful, failed }));
	}
}

export function openAddMcpServer(app: App, plugin: PluginHost, onAdded: () => void): void {
	const draft: MCPServerConfig = {
		name: 'New MCP server',
		command: '',
		args: [],
		env: {},
		enabled: true,
		connectionMode: 'auto',
		cachedTools: []
	};
	new MCPServerModal(app, draft, 'create', async (created) => {
		await plugin.updateSettings((settings) => {
			settings.mcpServers.push(created);
		});
		await plugin.services.tools.connectAutoMcpServers();
		onAdded();
	}).open();
}
