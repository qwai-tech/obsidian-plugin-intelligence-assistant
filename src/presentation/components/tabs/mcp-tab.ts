/**
 * MCP Settings Tab
 * Displays Model Context Protocol server management
 */

import { App, Notice } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import { snapshotMcpTools } from '@plugin';
import type { MCPServerConfig } from '@/types';
import type { RegisteredTool } from '@/types/common/tools';
import { t } from '@/i18n';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { MCPInspectorModal, MCPServerModal } from '../modals';

export function displayMCPTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	testAllMCPConnections: () => Promise<void>,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: t('settings.mcp.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.mcp.desc')
	});
	desc.addClass('ia-section-description');

	const toolbar = containerEl.createDiv('ia-toolbar');

	// Add MCP Inspector button
	const inspectorBtn = toolbar.createEl('button', { text: t('settings.mcp.inspectorBtn') });
	inspectorBtn.addClass('ia-button');
	inspectorBtn.addClass('ia-button--ghost');
	inspectorBtn.addEventListener('click', () => {
		new MCPInspectorModal(app, plugin).open();
	});

	// Add Test All Connections button
	const testAllBtn = toolbar.createEl('button', { text: t('settings.mcp.testAllBtn') });
	testAllBtn.addClass('ia-button');
	testAllBtn.addClass('ia-button--ghost');
	testAllBtn.addEventListener('click', () => {
		void (async () => {
			await testAllMCPConnections();
		})();
	});

	// Add Refresh All Tools button
	const refreshAllBtn = toolbar.createEl('button', { text: t('settings.mcp.refreshAllBtn') });
	refreshAllBtn.addClass('ia-button');
	refreshAllBtn.addClass('ia-button--ghost');
	refreshAllBtn.addEventListener('click', () => {
		void (async () => {
			const toolManager = plugin.getToolManager();
			const results = [];
			
			for (const server of plugin.settings.mcpServers) {
				if (!server.enabled) {
					continue; // Skip disabled servers
				}

				try {
					// Connect to the server and refresh its tools
					const tools = await toolManager.registerMCPServer(server);
					server.cachedTools = snapshotMcpTools(tools);
					server.cacheTimestamp = Date.now();
					results.push({ server: server.name, tools: tools.length, success: true });
					console.debug(`[MCP] Refreshed tools for ${server.name}: ${tools.length} tools`);
				} catch (error) {
					console.error(`[MCP] Failed to refresh tools for ${server.name}:`, error);
					const errorMsg = error instanceof Error ? error.message : String(error);
					results.push({ server: server.name, tools: 0, success: false, error: errorMsg });
				}
			}

			await plugin.saveSettings();
			refreshDisplay();
			
			// Show summary of results
			const successful = results.filter(r => r.success).length;
			const failed = results.filter(r => !r.success).length;
			if (failed === 0) {
				new Notice(t('settings.mcp.notices.refreshedAll', { count: successful }));
			} else {
				new Notice(t('settings.mcp.notices.refreshedPartial', { success: successful, failed }));
			}
		})();
	});

	// Add new MCP server button
	const addBtn = toolbar.createEl('button', { text: t('settings.mcp.addBtn') });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		const draft: MCPServerConfig = {
			name: 'New MCP Server',
			command: '',
			args: [],
			env: {},
			enabled: true,
			connectionMode: 'auto',
			cachedTools: []
		};
		new MCPServerModal(app, draft, 'create', async (created) => {
			plugin.settings.mcpServers.push(created);
			await plugin.saveSettings();
			await plugin.ensureAutoConnectedMcpServers();
			refreshDisplay();
		}).open();
	});

	// Display existing MCP servers in a table if they exist
	if (plugin.settings.mcpServers.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.mcp.empty'));
		return;
	}

	const table = createTable(containerEl, [
		t('settings.mcp.tableHeaders.name'),
		t('settings.mcp.tableHeaders.command'),
		t('settings.mcp.tableHeaders.arguments'),
		t('settings.mcp.tableHeaders.status'),
		t('settings.mcp.tableHeaders.tools'),
		t('settings.mcp.tableHeaders.actions')
	]);
	const tbody = table.tBodies[0];
	const cacheFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const toolManager = plugin.getToolManager();
	plugin.ensureAutoConnectedMcpServers()
		.then(changed => {
			if (changed) {
				refreshDisplay();
			}
		})
		.catch(error => console.error('[MCP] Auto-connect check failed', error));
	const registry = plugin.getToolRegistry();
	const allTools = registry.getTools();

	const toolsByProviderSnapshot = new Map<string, RegisteredTool[]>();
	for (const tool of allTools) {
		const key = `${tool.origin.kind}:${tool.origin.sourceId}`;
		if (!toolsByProviderSnapshot.has(key)) toolsByProviderSnapshot.set(key, []);
		toolsByProviderSnapshot.get(key)!.push(tool);
	}

	const connectedServerSet = new Set<string>();
	for (const tool of allTools) {
		if (tool.origin.kind === 'mcp') {
			connectedServerSet.add(tool.origin.sourceId);
		}
	}

	plugin.settings.mcpServers.forEach((server, index) => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		// Name column
		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameStack = nameCell.createDiv('ia-table-stack');
		nameStack.createDiv('ia-table-primary').setText(server.name || t('settings.mcp.untitled'));
		const envCount = server.env ? Object.keys(server.env).length : 0;
		if (envCount > 0) {
			nameStack.createDiv('ia-table-subtext').setText(t('settings.mcp.envVars', { count: envCount }));
		}

		// Command column
		const commandCell = row.insertCell();
		commandCell.addClass('ia-table-cell');
		const commandDisplay = commandCell.createDiv(server.command ? 'ia-code' : 'ia-table-subtext');
		commandDisplay.setText(server.command || t('settings.mcp.notConfigured'));

		// Arguments column
		const argsCell = row.insertCell();
		argsCell.addClass('ia-table-cell');
		const argsPreview = server.args && server.args.length > 0 ? server.args.join(', ') : t('settings.mcp.noArgs');
		const argsDisplay = argsCell.createDiv(server.args && server.args.length > 0 ? 'ia-code' : 'ia-table-subtext');
		argsDisplay.setText(argsPreview);

		// Status column
		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		const statusStack = statusCell.createDiv('ia-table-stack');
		const connectionMode = server.connectionMode ?? 'auto';
		const cachedToolCount = server.cachedTools?.length ?? 0;
		const cacheDate = server.cacheTimestamp ? new Date(server.cacheTimestamp) : null;
		const serverTools = toolsByProviderSnapshot.get(`mcp:${server.name}`) || [];
		const toolCount = serverTools.length;
		const isConnected = connectedServerSet.has(server.name);

		let statusKind: 'success' | 'warning' | 'error' | 'info';
		let statusLabel: string;

		if (!server.enabled) {
			statusKind = 'error';
			statusLabel = t('settings.mcp.status.disabled');
		} else if (isConnected) {
			statusKind = 'success';
			statusLabel = t('settings.mcp.status.connected');
		} else {
			statusKind = 'warning';
			statusLabel = t('settings.mcp.status.disconnected');
		}

		createStatusIndicator(statusStack, statusKind, statusLabel);

		const statusDetails: string[] = [];
		if (!server.enabled) {
			statusDetails.push(t('settings.mcp.status.enableToManage'));
		} else {
			statusDetails.push(connectionMode === 'manual' ? t('settings.mcp.status.manualConnect') : t('settings.mcp.status.autoConnect'));
			if (isConnected) {
				statusDetails.push(t('settings.mcp.toolCount.live', { count: toolCount }));
			} else if (cachedToolCount > 0) {
				statusDetails.push(t('settings.mcp.toolCount.cached', { count: cachedToolCount }));
			}
		}

		if (!isConnected && cacheDate) {
			statusDetails.push(`${t('settings.mcp.cached')} ${cacheFormatter.format(cacheDate)}`);
		}

		if (statusDetails.length > 0) {
			statusStack.createDiv('ia-table-subtext').setText(statusDetails.join(' • '));
		}

		// Tools column
		const toolsCell = row.insertCell();
		toolsCell.addClass('ia-table-cell');
		const toolsBadge = toolsCell.createSpan('ia-count-badge');
		if (isConnected) {
			toolsBadge.setText(toolCount.toString());
		} else if (cachedToolCount > 0) {
			toolsBadge.setText(cachedToolCount.toString());
			toolsCell.createDiv('ia-table-subtext').setText(t('settings.mcp.cached'));
		} else {
			toolsBadge.setText('0');
			if (!server.enabled) {
				toolsCell.createDiv('ia-table-subtext').setText(t('settings.mcp.disabled'));
			}
		}

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.edit') });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			const draft = JSON.parse(JSON.stringify(server)) as MCPServerConfig;
			new MCPServerModal(app, draft, 'edit', async (updated) => {
				plugin.settings.mcpServers[index] = updated;
				await plugin.saveSettings();
				await plugin.ensureAutoConnectedMcpServers();
				refreshDisplay();
			}).open();
		});

		// Enable/Disable toggle
		const toggleBtn = actionsCell.createEl('button', {
			text: server.enabled ? t('settings.mcp.actions.enabled') : t('settings.mcp.actions.enabledOff')
		});
		toggleBtn.addClass('ia-button');
		toggleBtn.addClass(server.enabled ? 'ia-button--success' : 'ia-button--ghost');
		toggleBtn.addEventListener('click', () => {
			void (async () => {
				const wasEnabled = server.enabled;
				server.enabled = !server.enabled;
				try {
					if (!server.enabled && wasEnabled && isConnected) {
						await toolManager.unregisterMCPServer(server.name);
					}

					if (server.enabled && connectionMode === 'auto') {
						try {
							const tools = await toolManager.registerMCPServer(server);
							server.cachedTools = snapshotMcpTools(tools);
							server.cacheTimestamp = Date.now();
						} catch (error) {
							console.error(`[MCP] Failed to auto-connect ${server.name}:`, error);
							new Notice(t('settings.mcp.notices.autoConnectFailed', { name: server.name }));
						}
					}
				} finally {
					await plugin.saveSettings();
					refreshDisplay();
				}
			})();
		});

		const connectBtn = actionsCell.createEl('button', { text: isConnected ? t('settings.mcp.actions.disconnect') : t('settings.mcp.actions.connect') });
		connectBtn.addClass('ia-button');
		connectBtn.addClass(isConnected ? 'ia-button--danger' : 'ia-button--ghost');
		connectBtn.disabled = !server.enabled;
		connectBtn.addEventListener('click', () => {
			void (async () => {
				const currentlyConnected = toolManager.getMCPServers().includes(server.name);
				const originalText = connectBtn.textContent ?? '';
				connectBtn.disabled = true;
				connectBtn.textContent = currentlyConnected ? t('settings.mcp.actions.disconnecting') : t('settings.mcp.actions.connecting');

				try {
					if (currentlyConnected) {
						await toolManager.unregisterMCPServer(server.name);
						new Notice(t('settings.mcp.notices.disconnected', { name: server.name }));
					} else {
						if (!server.enabled) {
							new Notice(t('settings.mcp.notices.enableFirst'));
							return;
						}
						const tools = await toolManager.registerMCPServer(server);
						server.cachedTools = snapshotMcpTools(tools);
						server.cacheTimestamp = Date.now();
						await plugin.saveSettings();
						new Notice(t('settings.mcp.notices.connected', { name: server.name }));
					}
				} catch (error) {
					console.error(`[MCP] Failed to ${currentlyConnected ? 'disconnect' : 'connect'} ${server.name}:`, error);
					if (currentlyConnected) {
						new Notice(t('settings.mcp.notices.disconnectFailed', { name: server.name }));
					} else {
						new Notice(t('settings.mcp.notices.connectFailed', { name: server.name }));
					}
				} finally {
					connectBtn.disabled = !server.enabled;
					connectBtn.textContent = originalText;
					refreshDisplay();
				}
			})();
		});

		// Test button
		const testBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.test') });
		testBtn.addClass('ia-button');
		testBtn.addClass('ia-button--ghost');
		testBtn.addEventListener('click', () => {
			void (async () => {
				// Validate command before testing
				if (!server.command || server.command.trim() === '') {
					new Notice(t('settings.mcp.notices.testNoCommand'));
					return;
				}

				testBtn.textContent = t('settings.mcp.actions.testing');
				testBtn.disabled = true;

				try {
					// Import MCPClient for testing
					const { MCPClient } = await import('@/application/services/mcp-client');
					const testClient = new MCPClient(server);

					await testClient.connect();
					const tools = await testClient.listTools();
					await testClient.disconnect();

					server.cachedTools = snapshotMcpTools(tools);
					server.cacheTimestamp = Date.now();
					await plugin.saveSettings();

					new Notice(t('settings.mcp.notices.testSuccess', { count: tools.length }));
					refreshDisplay(); // Refresh the entire view to update status indicators
				} catch (error) {
					console.error('[MCP] Test connection failed:', error);

					// Provide helpful error messages for common issues
					const errorMessage = error instanceof Error ? error.message : String(error);
					let displayMessage = errorMessage;
					if (errorMessage.includes('ENOENT') && server.command === 'npx') {
						displayMessage = 'npx command not found. Try using the full path (e.g., /usr/local/bin/npx) or install the package globally first.';
					} else if (errorMessage.includes('ENOENT') && server.command === 'uvx') {
						displayMessage = 'uvx command not found. Please install uv first: "curl -LsSf https://astral.sh/uv/install.sh | sh" or try using the full path (e.g., ~/.local/bin/uvx or ~/.cargo/bin/uvx).';
					} else if (errorMessage.includes('ENOENT')) {
						displayMessage = `Command "${server.command}" not found. Please check the command path.`;
					}

					new Notice(t('settings.mcp.notices.testFailed', { message: displayMessage }));
				} finally {
					testBtn.disabled = false;
					testBtn.textContent = t('settings.mcp.actions.test');
				}
			})();
		});

		// Delete button
		const deleteBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.delete') });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (await showConfirm(app, t('settings.mcp.confirm.delete', { name: server.name }))) {
					plugin.settings.mcpServers.splice(index, 1);
					await plugin.saveSettings();
					refreshDisplay();
				}
			})();
		});
	});
}
