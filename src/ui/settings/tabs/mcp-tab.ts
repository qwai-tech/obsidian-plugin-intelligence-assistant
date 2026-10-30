/**
 * MCP Settings Tab
 * Displays Model Context Protocol server management
 */

import { App, Notice, Setting } from 'obsidian';
import { showConfirm } from '@/ui/modals/confirm-modal';
import type { PluginHost } from '@/ui/plugin-host';
import type { MCPServerConfig, RegisteredTool } from '@/features/tools';
import { t } from '@/i18n';
import { createStatusIndicator } from '@/ui/utils/ui-helpers';
import { TestIds } from '@/ui/utils/test-ids';
import { MCPInspectorModal } from '@/ui/modals/mcp-inspector-modal';
import { MCPServerModal } from '@/ui/modals/mcp-server-modal';
import { errorMessage } from '@/core/utils/errors';
import { openAddMcpServer } from './mcp-actions';

export function displayMCPTab(
	containerEl: HTMLElement,
	plugin: PluginHost,
	app: App,
	testAllMCPConnections: () => Promise<void>,
	refreshDisplay: () => void
): void {

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
			const results = await plugin.services.tools.refreshMcpServers();
			refreshDisplay();

			const failed = results.filter(r => r.error).length;
			const successful = results.length - failed;
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
	addBtn.setAttribute('data-testid', TestIds.settings.mcpAddBtn);
	addBtn.addEventListener('click', () => openAddMcpServer(app, plugin, refreshDisplay));

	// Display existing MCP servers in a table if they exist
	if (plugin.settings.mcpServers.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.mcp.empty'));
		return;
	}

	const cacheFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	plugin.services.tools.connectAutoMcpServers()
		.then(changed => {
			if (changed) {
				refreshDisplay();
			}
		})
		.catch(error => console.error('[MCP] Auto-connect check failed', error));
	const registry = plugin.services.tools.registry;
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
		const row = new Setting(containerEl);
		row.settingEl.addClass('ia-list-row');
		row.settingEl.setAttribute('data-testid', TestIds.settings.mcpRow);
		row.settingEl.setAttribute('data-mcp-name', server.name);
		row.setName(server.name || t('settings.mcp.untitled'));

		const command = [server.command, ...(server.args ?? [])].filter(Boolean).join(' ');
		row.descEl.createDiv({ cls: command ? 'ia-code' : '', text: command || t('settings.mcp.notConfigured') });
		const envCount = server.env ? Object.keys(server.env).length : 0;
		if (envCount > 0) {
			row.descEl.createDiv({ text: t('settings.mcp.envVars', { count: envCount }) });
		}

		// Status column
		const statusStack = row.descEl.createDiv();
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

		// Actions column
		const actionsCell = row.controlEl;

		const editBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.edit') });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			const draft = JSON.parse(JSON.stringify(server)) as MCPServerConfig;
			new MCPServerModal(app, draft, 'edit', async (updated) => {
				await plugin.updateSettings((settings) => {
					settings.mcpServers[index] = updated;
				});
				await plugin.services.tools.syncMcpServers();
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
						await plugin.services.tools.disconnectMcp(server.name);
					}

					if (server.enabled && connectionMode === 'auto') {
						try {
							await plugin.services.tools.connectMcp(server);
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
		connectBtn.setAttribute('data-testid', TestIds.settings.mcpConnectBtn);
		connectBtn.setAttribute('data-mcp-name', server.name);
		connectBtn.disabled = !server.enabled;
		connectBtn.addEventListener('click', () => {
			void (async () => {
				const currentlyConnected = plugin.services.tools.isMcpConnected(server.name);
				const originalText = connectBtn.textContent ?? '';
				connectBtn.disabled = true;
				connectBtn.textContent = currentlyConnected ? t('settings.mcp.actions.disconnecting') : t('settings.mcp.actions.connecting');

				try {
					if (currentlyConnected) {
						await plugin.services.tools.disconnectMcp(server.name);
						new Notice(t('settings.mcp.notices.disconnected', { name: server.name }));
					} else {
						if (!server.enabled) {
							new Notice(t('settings.mcp.notices.enableFirst'));
							return;
						}
						await plugin.services.tools.connectMcp(server);
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
					const tools = await plugin.services.tools.probeMcp(server);
					await plugin.updateSettings(() => {
						server.cachedTools = tools;
						server.cacheTimestamp = Date.now();
					});

					new Notice(t('settings.mcp.notices.testSuccess', { count: tools.length }));
					refreshDisplay(); // Refresh the entire view to update status indicators
				} catch (error) {
					console.error('[MCP] Test connection failed:', error);

					// Provide helpful error messages for common issues
					const failure = errorMessage(error);
					let displayMessage = failure;
					if (failure.includes('ENOENT') && server.command === 'npx') {
						displayMessage = 'npx command not found. Try using the full path (e.g., /usr/local/bin/npx) or install the package globally first.';
					} else if (failure.includes('ENOENT') && server.command === 'uvx') {
						displayMessage = 'uvx command not found. Please install uv first: "curl -LsSf https://astral.sh/uv/install.sh | sh" or try using the full path (e.g., ~/.local/bin/uvx or ~/.cargo/bin/uvx).';
					} else if (failure.includes('ENOENT')) {
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
		deleteBtn.setAttribute('data-testid', TestIds.settings.mcpDeleteBtn);
		deleteBtn.setAttribute('data-mcp-name', server.name);
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (await showConfirm(app, t('settings.mcp.confirm.delete', { name: server.name }))) {
					await plugin.updateSettings((settings) => {
						settings.mcpServers.splice(index, 1);
					});
					refreshDisplay();
				}
			})();
		});
	});
}
