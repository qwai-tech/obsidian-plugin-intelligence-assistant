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
		const descEl = contentEl.createEl('p', {
			text: 'Inspect and debug Model Context Protocol (MCP) server connections and tools.'
		});
		descEl.setCssProps({ 'color': 'var(--text-muted)' });

		// Create tabs for different views
		const tabContainer = contentEl.createDiv();
		tabContainer.removeClass('ia-hidden');
		tabContainer.setCssProps({ 'margin-bottom': '16px' });

		const connectionsTab = tabContainer.createEl('button', { text: 'Connections' });
		const toolsTab = tabContainer.createEl('button', { text: 'Tools' });
		const logsTab = tabContainer.createEl('button', { text: 'Logs' });

		// Style tabs
		const tabs = [connectionsTab, toolsTab, logsTab];
		tabs.forEach((tab, index) => {
			tab.setCssProps({ 'flex': '1' });
			tab.setCssProps({ 'padding': '8px' });
			tab.addClass('ia-clickable');
			tab.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
			tab.setCssProps({ 'background': 'var(--background-primary)' });
			tab.setCssProps({ 'color': 'var(--text-normal)' });

			if (index === 0) {
				tab.setCssProps({ 'background': 'var(--interactive-accent)' });
				tab.setCssProps({ 'color': 'white' });
			}

			// Remove border on selected side
			if (index > 0) {
				tab.setCssProps({ 'border-left': 'none' });
			}

			if (index === tabs.length - 1) {
				tab.setCssProps({ 'border-radius': '0 4px 4px 0' });
			} else if (index === 0) {
				tab.setCssProps({ 'border-radius': '4px 0 0 4px' });
			}
		});

		// Content area
		const contentContainer = contentEl.createDiv();
		contentContainer.setCssProps({ 'min-height': '300px' });
		contentContainer.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
		contentContainer.setCssProps({ 'border-radius': '0 4px 4px 4px' });
		contentContainer.setCssProps({ 'padding': '16px' });

		// Create content for each tab
		const connectionsContent = contentContainer.createDiv();
		const toolsContent = contentContainer.createDiv();
		toolsContent.addClass('ia-hidden');
		const logsContent = contentContainer.createDiv();
		logsContent.addClass('ia-hidden');

		// Populate initial content
		this.renderConnectionsTab(connectionsContent);
		this.renderToolsTab(toolsContent);
		this.renderLogsTab(logsContent);

		// Tab switching logic
		connectionsTab.addEventListener('click', () => {
			connectionsContent.removeClass('ia-hidden');
			toolsContent.addClass('ia-hidden');
			logsContent.addClass('ia-hidden');

			// Update active tab styles
			tabs.forEach((tab, index) => {
				if (index === 0) {
					tab.setCssProps({ 'background': 'var(--interactive-accent)' });
					tab.setCssProps({ 'color': 'white' });
				} else {
					tab.setCssProps({ 'background': 'var(--background-primary)' });
					tab.setCssProps({ 'color': 'var(--text-normal)' });
				}
			});
		});

		toolsTab.addEventListener('click', () => {
			connectionsContent.addClass('ia-hidden');
			toolsContent.removeClass('ia-hidden');
			logsContent.addClass('ia-hidden');

			// Update active tab styles
			tabs.forEach((tab, index) => {
				if (index === 1) {
					tab.setCssProps({ 'background': 'var(--interactive-accent)' });
					tab.setCssProps({ 'color': 'white' });
				} else {
					tab.setCssProps({ 'background': 'var(--background-primary)' });
					tab.setCssProps({ 'color': 'var(--text-normal)' });
				}
			});
		});

		logsTab.addEventListener('click', () => {
			connectionsContent.addClass('ia-hidden');
			toolsContent.addClass('ia-hidden');
			logsContent.removeClass('ia-hidden');

			// Update active tab styles
			tabs.forEach((tab, index) => {
				if (index === 2) {
					tab.setCssProps({ 'background': 'var(--interactive-accent)' });
					tab.setCssProps({ 'color': 'white' });
				} else {
					tab.setCssProps({ 'background': 'var(--background-primary)' });
					tab.setCssProps({ 'color': 'var(--text-normal)' });
				}
			});
		});

		// Refresh button
		const refreshBtn = contentEl.createEl('button', { text: '🔄 Refresh' });
		refreshBtn.setCssProps({ 'margin-top': '16px' });
		refreshBtn.setCssProps({ 'padding': '6px 12px' });
		refreshBtn.setCssProps({ 'background': 'var(--interactive-accent)' });
		refreshBtn.setCssProps({ 'color': 'white' });
		refreshBtn.setCssProps({ 'border': 'none' });
		refreshBtn.setCssProps({ 'border-radius': '4px' });
		refreshBtn.addClass('ia-clickable');

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
		table.setCssProps({ 'width': '100%' });
		table.setCssProps({ 'border-collapse': 'collapse' });

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
				statusCell.setCssProps({ 'color': 'var(--text-muted)' });
			} else if (isConnected) {
				statusCell.setText('● Connected');
				statusCell.setCssProps({ 'color': 'var(--text-success)' });
			} else {
				statusCell.setText('○ Disconnected');
				statusCell.setCssProps({ 'color': 'var(--text-error)' });
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
			actionBtn.setCssProps({ 'padding': '4px 8px' });
			actionBtn.setCssProps({ 'font-size': '12px' });
			actionBtn.addClass('ia-clickable');

			if (isConnected) {
				actionBtn.setCssProps({ 'background': 'var(--background-modifier-error)' });
				actionBtn.setCssProps({ 'color': 'white' });
			} else {
				actionBtn.setCssProps({ 'background': 'var(--interactive-accent)' });
				actionBtn.setCssProps({ 'color': 'white' });
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
			toolsTable.setCssProps({ 'width': '100%' });
			toolsTable.setCssProps({ 'border-collapse': 'collapse' });

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
					paramsList.setCssProps({ 'margin': '0' });
					paramsList.setCssProps({ 'padding-left': '16px' });
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
		logContainer.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
		logContainer.setCssProps({ 'border-radius': '4px' });
		logContainer.setCssProps({ 'padding': '8px' });
		logContainer.setCssProps({ 'height': '200px' });
		logContainer.setCssProps({ 'overflow-y': 'auto' });
		logContainer.setCssProps({ 'background': 'var(--background-primary)' });
		logContainer.setCssProps({ 'font-family': 'monospace' });
		logContainer.setCssProps({ 'font-size': '12px' });

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
		testSection.setCssProps({ 'margin-top': '16px' });

		testSection.createEl('h4', { text: 'Test Tool Execution' });

		const selectionRow = testSection.createDiv();
		selectionRow.removeClass('ia-hidden');
		selectionRow.setCssProps({ 'gap': '8px' });
		selectionRow.setCssProps({ 'margin-bottom': '12px' });
		selectionRow.setCssProps({ 'align-items': 'center' });

		const serverSelect = selectionRow.createEl('select');
		serverSelect.setCssProps({ 'flex': '1' });
		const inspectorToolManager = this.plugin.getToolManager();
		const connectedServers = inspectorToolManager.getMCPServers();

		serverSelect.createEl('option', { text: 'Select a server...', value: '' });
		for (const serverName of connectedServers) {
			serverSelect.createEl('option', { text: serverName, value: serverName });
		}

		const toolSelect = selectionRow.createEl('select');
		toolSelect.setCssProps({ 'flex': '1' });
		toolSelect.disabled = true;
		toolSelect.createEl('option', { text: 'Select a tool...', value: '' });

		// Container for dynamic parameter inputs
		const paramsContainer = testSection.createDiv();
		paramsContainer.addClass('ia-hidden');
		paramsContainer.setCssProps({ 'margin-bottom': '12px' });
		paramsContainer.setCssProps({ 'padding': '12px' });
		paramsContainer.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
		paramsContainer.setCssProps({ 'border-radius': '4px' });
		paramsContainer.setCssProps({ 'background': 'var(--background-secondary)' });

		// Update tools when server is selected
		serverSelect.addEventListener('change', () => {
			toolSelect.empty();
			toolSelect.disabled = !serverSelect.value;
			paramsContainer.addClass('ia-hidden');
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
			paramsContainer.addClass('ia-hidden');

			if (!toolSelect.value) return;

			const tool = inspectorToolManager.getTool(toolSelect.value);
			if (!tool || !tool.definition.parameters || tool.definition.parameters.length === 0) {
				return;
			}

			// Show parameters section
			paramsContainer.removeClass('ia-hidden');
			paramsContainer.createEl('h5', { text: 'Parameters' });

			for (const param of tool.definition.parameters) {
				const paramRow = paramsContainer.createDiv();
				paramRow.setCssProps({ 'margin-bottom': '8px' });

				const label = paramRow.createEl('label');
				label.removeClass('ia-hidden');
				label.setCssProps({ 'margin-bottom': '4px' });
				label.setCssProps({ 'font-weight': '600' });
				label.setText(`${param.name}${param.required ? ' *' : ''}`);

				if (param.description) {
					const desc = paramRow.createEl('div');
					desc.setCssProps({ 'font-size': '0.9em' });
					desc.setCssProps({ 'color': 'var(--text-muted)' });
					desc.setCssProps({ 'margin-bottom': '4px' });
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

				input.setCssProps({ 'width': '100%' });
				input.dataset.paramName = param.name;
				input.dataset.paramType = param.type;
				input.dataset.required = param.required ? 'true' : 'false';
			}
		});

		// Buttons row
		const buttonsRow = testSection.createDiv();
		buttonsRow.removeClass('ia-hidden');
		buttonsRow.setCssProps({ 'gap': '8px' });
		buttonsRow.setCssProps({ 'margin-bottom': '12px' });

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
		resultContainer.addClass('ia-hidden');
		resultContainer.setCssProps({ 'margin-top': '12px' });
		resultContainer.setCssProps({ 'padding': '12px' });
		resultContainer.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
		resultContainer.setCssProps({ 'border-radius': '4px' });
		resultContainer.setCssProps({ 'background': 'var(--background-primary)' });
		resultContainer.setCssProps({ 'font-family': 'monospace' });
		resultContainer.setCssProps({ 'font-size': '12px' });
		resultContainer.setCssProps({ 'max-height': '300px' });
		resultContainer.setCssProps({ 'overflow-y': 'auto' });

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
			resultContainer.addClass('ia-hidden');

			try {
				const result = await inspectorToolManager.executeTool({
					name: toolSelect.value,
					arguments: args
				});

				// Display result
				resultContainer.empty();
				resultContainer.removeClass('ia-hidden');

				const header = resultContainer.createEl('div');
				header.setCssProps({ 'margin-bottom': '8px' });
				header.setCssProps({ 'font-weight': '600' });

				if (result.success) {
					header.setCssProps({ 'color': 'var(--text-success)' });
					header.setText('✅ Execution Successful');
				} else {
					header.setCssProps({ 'color': 'var(--text-error)' });
					header.setText('❌ Execution Failed');
				}

				if (result.error) {
					const errorDiv = resultContainer.createEl('div');
					errorDiv.setCssProps({ 'color': 'var(--text-error)' });
					errorDiv.setCssProps({ 'margin-bottom': '8px' });
					errorDiv.setText(`Error: ${result.error}`);
				}

				if (result.result !== undefined) {
					const resultDiv = resultContainer.createEl('pre');
					resultDiv.setCssProps({ 'white-space': 'pre-wrap' });
					resultDiv.setCssProps({ 'word-break': 'break-word' });
					resultDiv.setCssProps({ 'margin': '0' });
					resultDiv.setText(typeof result.result === 'string'
						? result.result
						: JSON.stringify(result.result, null, 2));
				}

				new Notice(result.success ? 'Tool executed successfully' : 'Tool execution failed');
			} catch (error: any) {
				resultContainer.empty();
				resultContainer.removeClass('ia-hidden');

				const header = resultContainer.createEl('div');
				header.setCssProps({ 'color': 'var(--text-error)' });
				header.setCssProps({ 'font-weight': '600' });
				header.setCssProps({ 'margin-bottom': '8px' });
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
			resultContainer.addClass('ia-hidden');
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

				console.debug(`[MCP] ${server.name} connection test: ${tools.length} tools available`);
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
			console.debug('[MCP] Connection test results:');
			for (const result of results) {
				console.debug(`  ${result.success ? '✅' : '❌'} ${result.name}: ${result.error || 'Connected'}`);
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
