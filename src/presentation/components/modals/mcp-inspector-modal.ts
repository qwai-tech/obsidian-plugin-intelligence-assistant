import { App, Modal, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { snapshotMcpTools } from '@plugin';

export class MCPInspectorModal extends Modal {
	private plugin: IntelligenceAssistantPlugin;

	constructor(app: App, plugin: IntelligenceAssistantPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'MCP Inspector' });
		contentEl.createEl('p', {
			text: 'Inspect and debug Model Context Protocol (MCP) server connections and tools.'
		}).style.color = 'var(--text-muted)';

		// Create tabs for different views
		const tabContainer = contentEl.createDiv();
		tabContainer.style.display = 'flex';
		tabContainer.style.marginBottom = '16px';

		const connectionsTab = tabContainer.createEl('button', { text: 'Connections' });
		const toolsTab = tabContainer.createEl('button', { text: 'Tools' });
		const logsTab = tabContainer.createEl('button', { text: 'Logs' });

		// Style tabs
		const tabs = [connectionsTab, toolsTab, logsTab];
		tabs.forEach((tab, index) => {
			tab.style.flex = '1';
			tab.style.padding = '8px';
			tab.style.cursor = 'pointer';
			tab.style.border = '1px solid var(--background-modifier-border)';
			tab.style.background = 'var(--background-primary)';
			tab.style.color = 'var(--text-normal)';

			if (index === 0) {
				tab.style.background = 'var(--interactive-accent)';
				tab.style.color = 'white';
			}

			// Remove border on selected side
			if (index > 0) {
				tab.style.borderLeft = 'none';
			}

			if (index === tabs.length - 1) {
				tab.style.borderRadius = '0 4px 4px 0';
			} else if (index === 0) {
				tab.style.borderRadius = '4px 0 0 4px';
			}
		});

		// Content area
		const contentContainer = contentEl.createDiv();
		contentContainer.style.minHeight = '300px';
		contentContainer.style.border = '1px solid var(--background-modifier-border)';
		contentContainer.style.borderRadius = '0 4px 4px 4px';
		contentContainer.style.padding = '16px';

		// Create content for each tab
		const connectionsContent = contentContainer.createDiv();
		const toolsContent = contentContainer.createDiv();
		toolsContent.style.display = 'none';
		const logsContent = contentContainer.createDiv();
		logsContent.style.display = 'none';

		// Populate initial content
		this.renderConnectionsTab(connectionsContent);
		this.renderToolsTab(toolsContent);
		this.renderLogsTab(logsContent);

		// Tab switching logic
		connectionsTab.addEventListener('click', () => {
			connectionsContent.style.display = 'block';
			toolsContent.style.display = 'none';
			logsContent.style.display = 'none';

			// Update active tab styles
			tabs.forEach((tab, index) => {
				if (index === 0) {
					tab.style.background = 'var(--interactive-accent)';
					tab.style.color = 'white';
				} else {
					tab.style.background = 'var(--background-primary)';
					tab.style.color = 'var(--text-normal)';
				}
			});
		});

		toolsTab.addEventListener('click', () => {
			connectionsContent.style.display = 'none';
			toolsContent.style.display = 'block';
			logsContent.style.display = 'none';

			// Update active tab styles
			tabs.forEach((tab, index) => {
				if (index === 1) {
					tab.style.background = 'var(--interactive-accent)';
					tab.style.color = 'white';
				} else {
					tab.style.background = 'var(--background-primary)';
					tab.style.color = 'var(--text-normal)';
				}
			});
		});

		logsTab.addEventListener('click', () => {
			connectionsContent.style.display = 'none';
			toolsContent.style.display = 'none';
			logsContent.style.display = 'block';

			// Update active tab styles
			tabs.forEach((tab, index) => {
				if (index === 2) {
					tab.style.background = 'var(--interactive-accent)';
					tab.style.color = 'white';
				} else {
					tab.style.background = 'var(--background-primary)';
					tab.style.color = 'var(--text-normal)';
				}
			});
		});

		// Refresh button
		const refreshBtn = contentEl.createEl('button', { text: '🔄 Refresh' });
		refreshBtn.style.marginTop = '16px';
		refreshBtn.style.padding = '6px 12px';
		refreshBtn.style.background = 'var(--interactive-accent)';
		refreshBtn.style.color = 'white';
		refreshBtn.style.border = 'none';
		refreshBtn.style.borderRadius = '4px';
		refreshBtn.style.cursor = 'pointer';

		refreshBtn.addEventListener('click', () => {
			// Refresh all tabs
			connectionsContent.empty();
			toolsContent.empty();
			logsContent.empty();

			this.renderConnectionsTab(connectionsContent);
			this.renderToolsTab(toolsContent);
			this.renderLogsTab(logsContent);
		});
	}

	private renderConnectionsTab(container: HTMLElement) {
		container.empty();
		container.createEl('h3', { text: 'MCP Server Connections' });

		// Check for active connections
		const toolManager = this.plugin.getToolManager();
		const connectedServers = toolManager.getMCPServers();
		const toolsByProvider = toolManager.getToolsByProvider();

		// Display configured servers
		if (this.plugin.settings.mcpServers.length === 0) {
			container.createEl('p', { text: 'No MCP servers configured.' });
			return;
		}

		const table = container.createEl('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = table.createEl('tr');
		headerRow.createEl('th', { text: 'Server Name' });
		headerRow.createEl('th', { text: 'Status' });
		headerRow.createEl('th', { text: 'Tools Available' });
		headerRow.createEl('th', { text: 'Actions' });

		for (const server of this.plugin.settings.mcpServers) {
			const row = table.createEl('tr');

			// Server name
			row.createEl('td', { text: server.name });

			// Connection status
			const statusCell = row.createEl('td');
			const isEnabled = server.enabled;
			const isConnected = connectedServers.includes(server.name);

			if (!isEnabled) {
				statusCell.setText('Disabled');
				statusCell.style.color = 'var(--text-muted)';
			} else if (isConnected) {
				statusCell.setText('● Connected');
				statusCell.style.color = 'var(--text-success)';
			} else {
				statusCell.setText('○ Disconnected');
				statusCell.style.color = 'var(--text-error)';
			}

			// Tools count
			const toolsCell = row.createEl('td');
			const serverTools = toolsByProvider.get(`mcp:${server.name}`) || [];
			const cachedTools = server.cachedTools?.length ?? 0;
			const activeCount = serverTools.length;
			if (isConnected) {
				toolsCell.setText(`${activeCount} tool${activeCount === 1 ? '' : 's'}`);
			} else if (cachedTools > 0) {
				toolsCell.setText(`${cachedTools} tool${cachedTools === 1 ? '' : 's'} (cached)`);
			} else {
				toolsCell.setText('0 tools');
			}

			// Actions
			const actionsCell = row.createEl('td');
			const actionBtn = actionsCell.createEl('button', { text: isConnected ? 'Disconnect' : 'Connect' });
			actionBtn.style.padding = '4px 8px';
			actionBtn.style.fontSize = '12px';
			actionBtn.style.cursor = 'pointer';

			if (isConnected) {
				actionBtn.style.background = 'var(--background-modifier-error)';
				actionBtn.style.color = 'white';
			} else {
				actionBtn.style.background = 'var(--interactive-accent)';
				actionBtn.style.color = 'white';
			}

			actionBtn.disabled = !isEnabled;
			actionBtn.addEventListener('click', async () => {
				const currentlyConnected = toolManager.getMCPServers().includes(server.name);
				actionBtn.disabled = true;
				const originalText = actionBtn.textContent ?? '';
				actionBtn.textContent = currentlyConnected ? 'Disconnecting...' : 'Connecting...';

				try {
					if (currentlyConnected) {
						await toolManager.unregisterMCPServer(server.name);
						new Notice(`Disconnected from ${server.name}`);
					} else {
						if (!server.enabled) {
							new Notice('Enable the server in settings before connecting');
							return;
						}
						const tools = await toolManager.registerMCPServer(server);
						server.cachedTools = snapshotMcpTools(tools);
						server.cacheTimestamp = Date.now();
						await this.plugin.saveSettings();
						new Notice(`Connected to ${server.name}`);
					}
				} catch (error) {
					console.error(`[MCP] Failed to ${currentlyConnected ? 'disconnect' : 'connect'} ${server.name}:`, error);
					new Notice(`Failed to ${currentlyConnected ? 'disconnect from' : 'connect to'} ${server.name}`);
				} finally {
					actionBtn.disabled = !server.enabled;
					actionBtn.textContent = originalText;
					this.renderConnectionsTab(container);
				}
			});
		}
	}

	private renderToolsTab(container: HTMLElement) {
		container.empty();
		container.createEl('h3', { text: 'Available MCP Tools' });

		// Check for active connections
		const toolManager = this.plugin.getToolManager();
		const toolsByProvider = toolManager.getToolsByProvider();

		// Filter to only MCP tools
		const mcpTools = Array.from(toolsByProvider.entries())
			.filter(([provider]) => provider.startsWith('mcp:'))
			.reduce((acc, [provider, tools]) => {
				acc[provider] = tools;
				return acc;
			}, {} as Record<string, any[]>);

		if (Object.keys(mcpTools).length === 0) {
			container.createEl('p', { text: 'No MCP tools available. Check server connections.' });
			return;
		}

		// Display tools by server
		for (const [provider, tools] of Object.entries(mcpTools)) {
			const serverName = provider.substring(4); // Remove 'mcp:' prefix
			const serverSection = container.createDiv();

			serverSection.createEl('h4', { text: `Server: ${serverName}` });

			if (tools.length === 0) {
				serverSection.createEl('p', { text: 'No tools available' });
				continue;
			}

			const toolsTable = serverSection.createEl('table');
			toolsTable.style.width = '100%';
			toolsTable.style.borderCollapse = 'collapse';

			const headerRow = toolsTable.createEl('tr');
			headerRow.createEl('th', { text: 'Tool Name' });
			headerRow.createEl('th', { text: 'Description' });
			headerRow.createEl('th', { text: 'Parameters' });

			for (const tool of tools) {
				const row = toolsTable.createEl('tr');

				row.createEl('td', { text: tool.definition.name });
				row.createEl('td', { text: tool.definition.description || 'No description' });

				const paramsCell = row.createEl('td');
				if (tool.definition.parameters && tool.definition.parameters.length > 0) {
					const paramsList = paramsCell.createEl('ul');
					paramsList.style.margin = '0';
					paramsList.style.paddingLeft = '16px';
					for (const param of tool.definition.parameters) {
						const paramItem = paramsList.createEl('li');
						paramItem.setText(`${param.name} (${param.type}): ${param.description || ''}`);
					}
				} else {
					paramsCell.setText('None');
				}
			}
		}
	}

	private renderLogsTab(container: HTMLElement) {
		container.empty();
		container.createEl('h3', { text: 'MCP Connection Logs' });

		// Display any stored logs or debugging information
		const logContainer = container.createDiv();
		logContainer.style.border = '1px solid var(--background-modifier-border)';
		logContainer.style.borderRadius = '4px';
		logContainer.style.padding = '8px';
		logContainer.style.height = '200px';
		logContainer.style.overflowY = 'auto';
		logContainer.style.background = 'var(--background-primary)';
		logContainer.style.fontFamily = 'monospace';
		logContainer.style.fontSize = '12px';

		logContainer.createEl('p', {
			text: 'MCP connection logs will appear here. Currently showing placeholder information.'
		});

		logContainer.createEl('p', {
			text: '• Connection events'
		});

		logContainer.createEl('p', {
			text: '• Tool registration events'
		});

		logContainer.createEl('p', {
			text: '• Error logs'
		});

		logContainer.createEl('p', {
			text: '• Communication details'
		});

		// Add a test tool execution section
		const testSection = container.createDiv();
		testSection.style.marginTop = '16px';

		testSection.createEl('h4', { text: 'Test Tool Execution' });

		const selectionRow = testSection.createDiv();
		selectionRow.style.display = 'flex';
		selectionRow.style.gap = '8px';
		selectionRow.style.marginBottom = '12px';
		selectionRow.style.alignItems = 'center';

		const serverSelect = selectionRow.createEl('select');
		serverSelect.style.flex = '1';
		const inspectorToolManager = this.plugin.getToolManager();
		const connectedServers = inspectorToolManager.getMCPServers();

		serverSelect.createEl('option', { text: 'Select a server...', value: '' });
		for (const serverName of connectedServers) {
			serverSelect.createEl('option', { text: serverName, value: serverName });
		}

		const toolSelect = selectionRow.createEl('select');
		toolSelect.style.flex = '1';
		toolSelect.disabled = true;
		toolSelect.createEl('option', { text: 'Select a tool...', value: '' });

		// Container for dynamic parameter inputs
		const paramsContainer = testSection.createDiv();
		paramsContainer.style.display = 'none';
		paramsContainer.style.marginBottom = '12px';
		paramsContainer.style.padding = '12px';
		paramsContainer.style.border = '1px solid var(--background-modifier-border)';
		paramsContainer.style.borderRadius = '4px';
		paramsContainer.style.background = 'var(--background-secondary)';

		// Update tools when server is selected
		serverSelect.addEventListener('change', () => {
			toolSelect.empty();
			toolSelect.disabled = !serverSelect.value;
			paramsContainer.style.display = 'none';
			paramsContainer.empty();

			if (serverSelect.value) {
				const toolsByProvider = inspectorToolManager.getToolsByProvider();
				const serverTools = toolsByProvider.get(`mcp:${serverSelect.value}`) || [];

				toolSelect.createEl('option', { text: 'Select a tool...', value: '' });
				for (const tool of serverTools) {
					toolSelect.createEl('option', {
						text: tool.definition.name,
						value: tool.definition.name
					});
				}
			}
		});

		// Update parameters when tool is selected
		toolSelect.addEventListener('change', () => {
			paramsContainer.empty();
			paramsContainer.style.display = 'none';

			if (!toolSelect.value) return;

			const tool = inspectorToolManager.getTool(toolSelect.value);
			if (!tool || !tool.definition.parameters || tool.definition.parameters.length === 0) {
				return;
			}

			// Show parameters section
			paramsContainer.style.display = 'block';
			paramsContainer.createEl('h5', { text: 'Parameters' });

			for (const param of tool.definition.parameters) {
				const paramRow = paramsContainer.createDiv();
				paramRow.style.marginBottom = '8px';

				const label = paramRow.createEl('label');
				label.style.display = 'block';
				label.style.marginBottom = '4px';
				label.style.fontWeight = '600';
				label.setText(`${param.name}${param.required ? ' *' : ''}`);

				if (param.description) {
					const desc = paramRow.createEl('div');
					desc.style.fontSize = '0.9em';
					desc.style.color = 'var(--text-muted)';
					desc.style.marginBottom = '4px';
					desc.setText(param.description);
				}

				// Create appropriate input based on parameter type
				let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

				if (param.enum) {
					// Enum: use select dropdown
					input = paramRow.createEl('select');
					input.createEl('option', { text: 'Select...', value: '' });
					for (const enumValue of param.enum) {
						input.createEl('option', { text: enumValue, value: enumValue });
					}
				} else if (param.type === 'boolean') {
					// Boolean: use checkbox
					input = paramRow.createEl('input', { type: 'checkbox' });
				} else if (param.type === 'number') {
					// Number: use number input
					input = paramRow.createEl('input', { type: 'number' });
				} else if (param.type === 'object' || param.type === 'array') {
					// Object/Array: use textarea for JSON input
					input = paramRow.createEl('textarea');
					(input as HTMLTextAreaElement).rows = 3;
					input.placeholder = param.type === 'array' ? '["item1", "item2"]' : '{"key": "value"}';
				} else {
					// String: use text input
					input = paramRow.createEl('input', { type: 'text' });
				}

				input.style.width = '100%';
				input.dataset.paramName = param.name;
				input.dataset.paramType = param.type;
				input.dataset.required = param.required ? 'true' : 'false';
			}
		});

		// Buttons row
		const buttonsRow = testSection.createDiv();
		buttonsRow.style.display = 'flex';
		buttonsRow.style.gap = '8px';
		buttonsRow.style.marginBottom = '12px';

		// Test execution button
		const testBtn = buttonsRow.createEl('button', { text: 'Execute Tool' });
		testBtn.addClass('ia-button');
		testBtn.addClass('ia-button--primary');
		testBtn.disabled = true;

		toolSelect.addEventListener('change', () => {
			testBtn.disabled = !toolSelect.value;
		});

		// Clear button
		const clearBtn = buttonsRow.createEl('button', { text: 'Clear Results' });
		clearBtn.addClass('ia-button');
		clearBtn.addClass('ia-button--ghost');

		// Result display area
		const resultContainer = testSection.createDiv();
		resultContainer.style.display = 'none';
		resultContainer.style.marginTop = '12px';
		resultContainer.style.padding = '12px';
		resultContainer.style.border = '1px solid var(--background-modifier-border)';
		resultContainer.style.borderRadius = '4px';
		resultContainer.style.background = 'var(--background-primary)';
		resultContainer.style.fontFamily = 'monospace';
		resultContainer.style.fontSize = '12px';
		resultContainer.style.maxHeight = '300px';
		resultContainer.style.overflowY = 'auto';

		testBtn.addEventListener('click', async () => {
			if (!toolSelect.value) return;

			// Collect parameter values
			const args: Record<string, any> = {};
			const paramInputs = paramsContainer.querySelectorAll('input, select, textarea');

			let validationError = false;
			for (const input of Array.from(paramInputs)) {
				const paramName = (input as HTMLElement).dataset.paramName;
				const paramType = (input as HTMLElement).dataset.paramType;
				const required = (input as HTMLElement).dataset.required === 'true';

				if (!paramName) continue;

				let value: any;
				if (input instanceof HTMLInputElement && input.type === 'checkbox') {
					value = input.checked;
				} else if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
					value = input.value;
				}

				// Validate required fields
				if (required && !value) {
					new Notice(`Required parameter missing: ${paramName}`);
					validationError = true;
					break;
				}

				// Skip empty optional fields
				if (!value) continue;

				// Parse based on type
				try {
					if (paramType === 'number') {
						value = parseFloat(value);
						if (isNaN(value)) {
							new Notice(`Invalid number for parameter: ${paramName}`);
							validationError = true;
							break;
						}
					} else if (paramType === 'boolean') {
						// Already handled by checkbox
					} else if (paramType === 'object' || paramType === 'array') {
						value = JSON.parse(value);
					}
					args[paramName] = value;
				} catch (error) {
					new Notice(`Invalid JSON for parameter: ${paramName}`);
					validationError = true;
					break;
				}
			}

			if (validationError) return;

			// Execute tool
			testBtn.disabled = true;
			testBtn.textContent = 'Executing...';
			resultContainer.style.display = 'none';

			try {
				const result = await inspectorToolManager.executeTool({
					name: toolSelect.value,
					arguments: args
				});

				// Display result
				resultContainer.empty();
				resultContainer.style.display = 'block';

				const header = resultContainer.createEl('div');
				header.style.marginBottom = '8px';
				header.style.fontWeight = '600';

				if (result.success) {
					header.style.color = 'var(--text-success)';
					header.setText('✅ Execution Successful');
				} else {
					header.style.color = 'var(--text-error)';
					header.setText('❌ Execution Failed');
				}

				if (result.error) {
					const errorDiv = resultContainer.createEl('div');
					errorDiv.style.color = 'var(--text-error)';
					errorDiv.style.marginBottom = '8px';
					errorDiv.setText(`Error: ${result.error}`);
				}

				if (result.result !== undefined) {
					const resultDiv = resultContainer.createEl('pre');
					resultDiv.style.whiteSpace = 'pre-wrap';
					resultDiv.style.wordBreak = 'break-word';
					resultDiv.style.margin = '0';
					resultDiv.setText(typeof result.result === 'string'
						? result.result
						: JSON.stringify(result.result, null, 2));
				}

				new Notice(result.success ? 'Tool executed successfully' : 'Tool execution failed');
			} catch (error: any) {
				resultContainer.empty();
				resultContainer.style.display = 'block';

				const header = resultContainer.createEl('div');
				header.style.color = 'var(--text-error)';
				header.style.fontWeight = '600';
				header.style.marginBottom = '8px';
				header.setText('❌ Execution Error');

				const errorDiv = resultContainer.createEl('div');
				errorDiv.setText(error.message || 'Unknown error');

				new Notice(`Execution error: ${error.message}`);
			} finally {
				testBtn.disabled = false;
				testBtn.textContent = 'Execute Tool';
			}
		});

		clearBtn.addEventListener('click', () => {
			resultContainer.empty();
			resultContainer.style.display = 'none';
		});
	}

	private async testAllMCPConnections() {
		const mcpServers = this.plugin.settings.mcpServers;

		if (mcpServers.length === 0) {
			new Notice('⚠️ No MCP servers configured');
			return;
		}

		new Notice(`🧪 Testing ${mcpServers.length} MCP server connections...`);

		const results: {name: string, success: boolean, error?: string}[] = [];
		let settingsDirty = false;

		for (const server of mcpServers) {
			if (!server.enabled) {
				results.push({ name: server.name, success: false, error: 'Server disabled' });
				continue;
			}

			try {
				// Test connection
				const { MCPClient } = await import('@/application/services/mcp-client');
				const testClient = new MCPClient(server);

				await testClient.connect();
				const tools = await testClient.listTools();
				await testClient.disconnect();

				server.cachedTools = snapshotMcpTools(tools);
				server.cacheTimestamp = Date.now();
				settingsDirty = true;

				results.push({
					name: server.name,
					success: true,
					error: undefined
				});

				console.log(`[MCP] ${server.name} connection test: ${tools.length} tools available`);
			} catch (error: any) {
				console.error(`[MCP] ${server.name} connection test failed:`, error);
				results.push({
					name: server.name,
					success: false,
					error: error.message || 'Connection failed'
				});
			}
		}

		if (settingsDirty) {
			await this.plugin.saveSettings();
		}

		// Show results
		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;

		if (failed === 0) {
			new Notice(`✅ All ${successful} MCP servers connected successfully!`);
		} else {
			new Notice(`⚠️ ${successful} connected, ${failed} failed`);

			// Show detailed results in console
			console.log('[MCP] Connection test results:');
			for (const result of results) {
				console.log(`  ${result.success ? '✅' : '❌'} ${result.name}: ${result.error || 'Connected'}`);
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
