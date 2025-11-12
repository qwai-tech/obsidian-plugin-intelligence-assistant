/**
 * MCP Settings Tab
 * Displays Model Context Protocol server management
 */

import { App, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { snapshotMcpTools } from '@plugin';
import type { MCPServerConfig } from '@/types';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { MCPInspectorModal, MCPServerModal } from '../modals';

export function displayMCPTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	testAllMCPConnections: () => Promise<void>,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'MCP Server Management' });

	const desc = containerEl.createEl('p', {
		text: 'Configure Model Context Protocol (MCP) servers to extend agent capabilities with external tools and data sources.'
	});
	desc.addClass('ia-section-description');

	const toolbar = containerEl.createDiv('ia-toolbar');

	// Add MCP Inspector button
	const inspectorBtn = toolbar.createEl('button', { text: '🔍 Open MCP Inspector' });
	inspectorBtn.addClass('ia-button');
	inspectorBtn.addClass('ia-button--ghost');
	inspectorBtn.addEventListener('click', () => {
		new MCPInspectorModal(app, plugin).open();
	});

	// Add Test All Connections button
	const testAllBtn = toolbar.createEl('button', { text: '🧪 Test All Connections' });
	testAllBtn.addClass('ia-button');
	testAllBtn.addClass('ia-button--ghost');
	testAllBtn.addEventListener('click', async () => {
		await testAllMCPConnections();
	});

	// Add Refresh All Tools button
	const refreshAllBtn = toolbar.createEl('button', { text: '🔄 Refresh All Tools' });
	refreshAllBtn.addClass('ia-button');
	refreshAllBtn.addClass('ia-button--ghost');
	refreshAllBtn.addEventListener('click', async () => {
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
				console.log(`[MCP] Refreshed tools for ${server.name}: ${tools.length} tools`);
			} catch (error) {
				console.error(`[MCP] Failed to refresh tools for ${server.name}:`, error);
				results.push({ server: server.name, tools: 0, success: false, error: error.message });
			}
		}

		await plugin.saveSettings();
		refreshDisplay();
		
		// Show summary of results
		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;
		if (failed === 0) {
			new Notice(`✅ Refreshed tools for ${successful} server${successful !== 1 ? 's' : ''}`);
		} else {
			new Notice(`✅ Refreshed ${successful} server${successful !== 1 ? 's' : ''}, ❌ ${failed} failed`);
		}
	});

	// Add new MCP server button
	const addBtn = toolbar.createEl('button', { text: '+ Add MCP Server' });
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
		emptyDiv.setText('No MCP servers configured. Click "Add MCP Server" to get started.');
		return;
	}

	const table = createTable(containerEl, ['Name', 'Command', 'Arguments', 'Status', 'Tools', 'Actions']);
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
	const toolsByProviderSnapshot = toolManager.getToolsByProvider();
	const connectedServerSet = new Set(toolManager.getMCPServers());

	plugin.settings.mcpServers.forEach((server, index) => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		// Name column
		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameStack = nameCell.createDiv('ia-table-stack');
		nameStack.createDiv('ia-table-primary').setText(server.name || 'Untitled MCP Server');
		const envCount = server.env ? Object.keys(server.env).length : 0;
		if (envCount > 0) {
			nameStack.createDiv('ia-table-subtext').setText(`${envCount} env var${envCount === 1 ? '' : 's'}`);
		}

		// Command column
		const commandCell = row.insertCell();
		commandCell.addClass('ia-table-cell');
		const commandDisplay = commandCell.createDiv(server.command ? 'ia-code' : 'ia-table-subtext');
		commandDisplay.setText(server.command || 'Not configured');

		// Arguments column
		const argsCell = row.insertCell();
		argsCell.addClass('ia-table-cell');
		const argsPreview = server.args && server.args.length > 0 ? server.args.join(', ') : 'None';
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
			statusLabel = 'Disabled';
		} else if (isConnected) {
			statusKind = 'success';
			statusLabel = 'Connected';
		} else {
			statusKind = 'warning';
			statusLabel = 'Disconnected';
		}

		createStatusIndicator(statusStack, statusKind, statusLabel);

		const statusDetails: string[] = [];
		if (!server.enabled) {
			statusDetails.push('Enable to manage connections');
		} else {
			statusDetails.push(connectionMode === 'manual' ? 'Manual connect' : 'Auto-connect');
			if (isConnected) {
				statusDetails.push(`${toolCount} live tool${toolCount === 1 ? '' : 's'}`);
			} else if (cachedToolCount > 0) {
				statusDetails.push(`${cachedToolCount} cached tool${cachedToolCount === 1 ? '' : 's'}`);
			}
		}

		if (!isConnected && cacheDate) {
			statusDetails.push(`Cached ${cacheFormatter.format(cacheDate)}`);
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
			toolsCell.createDiv('ia-table-subtext').setText('Cached');
		} else {
			toolsBadge.setText('0');
			if (!server.enabled) {
				toolsCell.createDiv('ia-table-subtext').setText('Disabled');
			}
		}

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
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
			text: server.enabled ? '✓ Enabled' : '✗ Disabled'
		});
		toggleBtn.addClass('ia-button');
		toggleBtn.addClass(server.enabled ? 'ia-button--success' : 'ia-button--ghost');
		toggleBtn.addEventListener('click', async () => {
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
						new Notice(`Failed to auto-connect ${server.name}`);
					}
				}
			} finally {
				await plugin.saveSettings();
				refreshDisplay();
			}
		});

		const connectBtn = actionsCell.createEl('button', { text: isConnected ? 'Disconnect' : 'Connect' });
		connectBtn.addClass('ia-button');
		connectBtn.addClass(isConnected ? 'ia-button--danger' : 'ia-button--ghost');
		connectBtn.disabled = !server.enabled;
		connectBtn.addEventListener('click', async () => {
			const currentlyConnected = toolManager.getMCPServers().includes(server.name);
			const originalText = connectBtn.textContent ?? '';
			connectBtn.disabled = true;
			connectBtn.textContent = currentlyConnected ? 'Disconnecting...' : 'Connecting...';

			try {
				if (currentlyConnected) {
					await toolManager.unregisterMCPServer(server.name);
					new Notice(`Disconnected from ${server.name}`);
				} else {
					if (!server.enabled) {
						new Notice('Enable the server before connecting');
						return;
					}
					const tools = await toolManager.registerMCPServer(server);
					server.cachedTools = snapshotMcpTools(tools);
					server.cacheTimestamp = Date.now();
					await plugin.saveSettings();
					new Notice(`Connected to ${server.name}`);
				}
			} catch (error) {
				console.error(`[MCP] Failed to ${currentlyConnected ? 'disconnect' : 'connect'} ${server.name}:`, error);
				new Notice(`Failed to ${currentlyConnected ? 'disconnect from' : 'connect to'} ${server.name}`);
			} finally {
				connectBtn.disabled = !server.enabled;
				connectBtn.textContent = originalText;
				refreshDisplay();
			}
		});

		// Test button
		const testBtn = actionsCell.createEl('button', { text: 'Test' });
		testBtn.addClass('ia-button');
		testBtn.addClass('ia-button--ghost');
		testBtn.addEventListener('click', async () => {
			// Validate command before testing
			if (!server.command || server.command.trim() === '') {
				new Notice('❌ Please enter a command before testing connection');
				return;
			}

			testBtn.textContent = 'Testing...';
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

				new Notice(`✅ Connected successfully! Found ${tools.length} tools.`);
				refreshDisplay(); // Refresh the entire view to update status indicators
			} catch (error) {
				console.error('[MCP] Test connection failed:', error);

				// Provide helpful error messages for common issues
				let errorMessage = error.message;
				if (errorMessage.includes('ENOENT') && server.command === 'npx') {
					errorMessage = 'npx command not found. Try using the full path (e.g., /usr/local/bin/npx) or install the package globally first.';
				} else if (errorMessage.includes('ENOENT') && server.command === 'uvx') {
					errorMessage = 'uvx command not found. Please install uv first: "curl -LsSf https://astral.sh/uv/install.sh | sh" or try using the full path (e.g., ~/.local/bin/uvx or ~/.cargo/bin/uvx).';
				} else if (errorMessage.includes('ENOENT')) {
					errorMessage = `Command "${server.command}" not found. Please check the command path.`;
				}

				new Notice(`❌ Connection failed: ${errorMessage}`);
			} finally {
				testBtn.disabled = false;
				testBtn.textContent = 'Test';
			}
		});

		// Delete button
		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', async () => {
			if (confirm(`Delete MCP server "${server.name}"?`)) {
				plugin.settings.mcpServers.splice(index, 1);
				await plugin.saveSettings();
				refreshDisplay();
			}
		});
	});
}
