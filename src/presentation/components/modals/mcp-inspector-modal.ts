import { App, Modal, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { snapshotMcpTools } from '@/application/tools/mcp-helpers';
import { McpToolSource } from '@/application/tools/sources/mcp-tool-source';
import type { ToolRegistry } from '@/application/tools/tool-registry';
import type { RegisteredTool } from '@/types/common/tools';
import { t } from '@/i18n';

/** Names of MCP servers that currently have tools loaded in the registry. */
function getConnectedMcpServers(registry: ToolRegistry): string[] {
	const seen = new Set<string>();
	for (const tool of registry.getTools()) {
		if (tool.origin.kind === 'mcp') {
			seen.add(tool.origin.sourceId);
		}
	}
	return [...seen];
}

/** Group all registered tools by `${origin.kind}:${origin.sourceId}` for the inspector UI. */
function getToolsByProviderKey(registry: ToolRegistry): Map<string, RegisteredTool[]> {
	const map = new Map<string, RegisteredTool[]>();
	for (const tool of registry.getTools()) {
		const key = `${tool.origin.kind}:${tool.origin.sourceId}`;
		const bucket = map.get(key);
		if (bucket) {
			bucket.push(tool);
		} else {
			map.set(key, [tool]);
		}
	}
	return map;
}

export class MCPInspectorModal extends Modal {
	private plugin: IntelligenceAssistantPlugin;

	constructor(app: App, plugin: IntelligenceAssistantPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: t('modals.mcpInspector.title') });
		const descEl = contentEl.createEl('p', {
			text: t('modals.mcpInspector.desc')
		});
		descEl.setCssProps({ 'color': 'var(--text-muted)' });

		// Create tabs for different views
		const tabContainer = contentEl.createDiv();
		tabContainer.removeClass('ia-hidden');
		tabContainer.setCssProps({ 'margin-bottom': '16px' });

		const connectionsTab = tabContainer.createEl('button', { text: t('modals.mcpInspector.tabs.connections') });
		const toolsTab = tabContainer.createEl('button', { text: t('modals.mcpInspector.tabs.tools') });
		const logsTab = tabContainer.createEl('button', { text: t('modals.mcpInspector.tabs.logs') });

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
		const refreshBtn = contentEl.createEl('button', { text: t('modals.mcpInspector.refreshBtn') });
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
		container.createEl('h3', { text: t('modals.mcpInspector.connections.title') });

		// Check for active connections
		const registry = this.plugin.getToolRegistry();
		const connectedServers = getConnectedMcpServers(registry);
		const toolsByProvider = getToolsByProviderKey(registry);

		// Display configured servers
		if (this.plugin.settings.mcpServers.length === 0) {
			container.createEl('p', { text: t('modals.mcpInspector.connections.noServers') });
			return;
		}

		const table = container.createEl('table');
		table.setCssProps({ 'width': '100%' });
		table.setCssProps({ 'border-collapse': 'collapse' });

		const headerRow = table.createEl('tr');
		headerRow.createEl('th', { text: t('modals.mcpInspector.connections.headers.server') });
		headerRow.createEl('th', { text: t('modals.mcpInspector.connections.headers.status') });
		headerRow.createEl('th', { text: t('modals.mcpInspector.connections.headers.tools') });
		headerRow.createEl('th', { text: t('modals.mcpInspector.connections.headers.actions') });

		for (const server of this.plugin.settings.mcpServers) {
			const row = table.createEl('tr');

			// Server name
			row.createEl('td', { text: server.name });

			// Connection status
			const statusCell = row.createEl('td');
			const isEnabled = server.enabled;
			const isConnected = connectedServers.includes(server.name);

			if (!isEnabled) {
				statusCell.setText(t('modals.mcpInspector.connections.statusDisabled'));
				statusCell.setCssProps({ 'color': 'var(--text-muted)' });
			} else if (isConnected) {
				statusCell.setText(t('modals.mcpInspector.connections.statusConnected'));
				statusCell.setCssProps({ 'color': 'var(--text-success)' });
			} else {
				statusCell.setText(t('modals.mcpInspector.connections.statusDisconnected'));
				statusCell.setCssProps({ 'color': 'var(--text-error)' });
			}

			// Tools count
			const toolsCell = row.createEl('td');
			const serverTools = toolsByProvider.get(`mcp:${server.name}`) || [];
			const cachedTools = server.cachedTools?.length ?? 0;
			const activeCount = serverTools.length;
			if (isConnected) {
				toolsCell.setText(t(activeCount === 1 ? 'modals.mcpInspector.connections.toolsLive' : 'modals.mcpInspector.connections.toolsLive_plural', { count: activeCount }));
			} else if (cachedTools > 0) {
				toolsCell.setText(t(cachedTools === 1 ? 'modals.mcpInspector.connections.toolsCached' : 'modals.mcpInspector.connections.toolsCached_plural', { count: cachedTools }));
			} else {
				toolsCell.setText(t('modals.mcpInspector.connections.noTools'));
			}

			// Actions
			const actionsCell = row.createEl('td');
			const actionBtn = actionsCell.createEl('button', { text: isConnected ? t('modals.mcpInspector.connections.disconnectBtn') : t('modals.mcpInspector.connections.connectBtn') });
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
			actionBtn.addEventListener('click', () => {
				void (async () => {
					const currentlyConnected = registry.hasSource('mcp', server.name);
					actionBtn.disabled = true;
					const originalText = actionBtn.textContent ?? '';
					actionBtn.textContent = currentlyConnected ? t('modals.mcpInspector.connections.disconnecting') : t('modals.mcpInspector.connections.connecting');

					try {
						if (currentlyConnected) {
							await registry.unregisterSource('mcp', server.name);
							new Notice(t('modals.mcpInspector.connections.notices.disconnected', { name: server.name }));
						} else {
							if (!server.enabled) {
								new Notice(t('modals.mcpInspector.connections.notices.enableFirst'));
								return;
							}
							registry.registerSource(new McpToolSource(server));
							const tools = await registry.reloadSource('mcp', server.name);
							server.cachedTools = snapshotMcpTools(tools);
							server.cacheTimestamp = Date.now();
							await this.plugin.saveSettings();
							new Notice(t('modals.mcpInspector.connections.notices.connected', { name: server.name }));
						}
					} catch (_error) {
						const err = _error instanceof Error ? _error : new Error(String(_error));
						console.error(`[MCP] Failed to ${currentlyConnected ? 'disconnect' : 'connect'} ${server.name}:`, err);
						new Notice(currentlyConnected
							? t('modals.mcpInspector.connections.notices.failedDisconnect', { name: server.name, message: err.message })
							: t('modals.mcpInspector.connections.notices.failedConnect', { name: server.name, message: err.message }));
					} finally {
						actionBtn.disabled = !server.enabled;
						actionBtn.textContent = originalText;
						this.renderConnectionsTab(container);
					}
				})();
			});
		}
	}

	private renderToolsTab(container: HTMLElement) {
		container.empty();
		container.createEl('h3', { text: t('modals.mcpInspector.tools.title') });

		// Check for active connections
		const toolsRegistry = this.plugin.getToolRegistry();
		const toolsByProvider = getToolsByProviderKey(toolsRegistry);

		// Filter to only MCP tools
		const mcpTools = Array.from(toolsByProvider.entries())
			.filter(([provider]) => provider.startsWith('mcp:'))
			.reduce((acc, [provider, tools]) => {
				acc[provider] = tools;
				return acc;
			}, {} as Record<string, RegisteredTool[]>);

		if (Object.keys(mcpTools).length === 0) {
			container.createEl('p', { text: t('modals.mcpInspector.tools.noTools') });
			return;
		}

		// Display tools by server
		for (const [provider, tools] of Object.entries(mcpTools)) {
			const serverName = provider.substring(4); // Remove 'mcp:' prefix
			const serverSection = container.createDiv();

			serverSection.createEl('h4', { text: t('modals.mcpInspector.tools.serverPrefix', { name: serverName }) });

			if (tools.length === 0) {
				serverSection.createEl('p', { text: t('modals.mcpInspector.tools.noToolsInServer') });
				continue;
			}

			const toolsTable = serverSection.createEl('table');
			toolsTable.setCssProps({ 'width': '100%' });
			toolsTable.setCssProps({ 'border-collapse': 'collapse' });

			const headerRow = toolsTable.createEl('tr');
			headerRow.createEl('th', { text: t('modals.mcpInspector.tools.headers.tool') });
			headerRow.createEl('th', { text: t('modals.mcpInspector.tools.headers.description') });
			headerRow.createEl('th', { text: t('modals.mcpInspector.tools.headers.parameters') });

			for (const tool of tools) {
				const row = toolsTable.createEl('tr');
				const def = tool.definition as { name: string; description?: string; parameters?: Array<{ name: string; type: string; description?: string }> };

				row.createEl('td', { text: def.name });
				row.createEl('td', { text: def.description || t('modals.mcpInspector.tools.noDescription') });

				const paramsCell = row.createEl('td');
				if (def.parameters && def.parameters.length > 0) {
					const paramsList = paramsCell.createEl('ul');
					paramsList.setCssProps({ 'margin': '0' });
					paramsList.setCssProps({ 'padding-left': '16px' });
					for (const param of def.parameters) {
						const paramItem = paramsList.createEl('li');
						paramItem.setText(`${param.name} (${param.type}): ${param.description || ''}`);
					}
				} else {
					paramsCell.setText(t('modals.mcpInspector.tools.noParams'));
				}
			}
		}
	}

	private renderLogsTab(container: HTMLElement) {
		container.empty();
		container.createEl('h3', { text: t('modals.mcpInspector.logs.title') });

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
			text: t('modals.mcpInspector.logs.placeholder')
		});

		logContainer.createEl('p', {
			text: t('modals.mcpInspector.logs.events.connection')
		});

		logContainer.createEl('p', {
			text: t('modals.mcpInspector.logs.events.tools')
		});

		logContainer.createEl('p', {
			text: t('modals.mcpInspector.logs.events.errors')
		});

		logContainer.createEl('p', {
			text: t('modals.mcpInspector.logs.events.comms')
		});

		// Add a test tool execution section
		const testSection = container.createDiv();
		testSection.setCssProps({ 'margin-top': '16px' });

		testSection.createEl('h4', { text: t('modals.mcpInspector.logs.testTitle') });

		const selectionRow = testSection.createDiv();
		selectionRow.removeClass('ia-hidden');
		selectionRow.setCssProps({ 'gap': '8px' });
		selectionRow.setCssProps({ 'margin-bottom': '12px' });
		selectionRow.setCssProps({ 'align-items': 'center' });

		const serverSelect = selectionRow.createEl('select');
		serverSelect.setCssProps({ 'flex': '1' });
		const inspectorRegistry = this.plugin.getToolRegistry();
		const connectedServers = getConnectedMcpServers(inspectorRegistry);

		serverSelect.createEl('option', { text: t('modals.mcpInspector.logs.selectServer'), value: '' });
		for (const serverName of connectedServers) {
			serverSelect.createEl('option', { text: serverName, value: serverName });
		}

		const toolSelect = selectionRow.createEl('select');
		toolSelect.setCssProps({ 'flex': '1' });
		toolSelect.disabled = true;
		toolSelect.createEl('option', { text: t('modals.mcpInspector.logs.selectTool'), value: '' });

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
				const toolsByProvider = getToolsByProviderKey(inspectorRegistry);
				const serverTools = toolsByProvider.get(`mcp:${serverSelect.value}`) || [];

				toolSelect.createEl('option', { text: t('modals.mcpInspector.logs.selectTool'), value: '' });
				for (const tool of serverTools) {
					toolSelect.createEl('option', {
						text: tool.definition.name,
						// Use llmName so executeTool() can find it after sanitization.
						value: tool.llmName,
					});
				}
			}
		});

		// Update parameters when tool is selected
		toolSelect.addEventListener('change', () => {
			paramsContainer.empty();
			paramsContainer.addClass('ia-hidden');

			if (!toolSelect.value) return;

			const tool = inspectorRegistry.getToolByLlmName(toolSelect.value);
			if (!tool || !tool.definition.parameters || tool.definition.parameters.length === 0) {
				return;
			}

			// Show parameters section
			paramsContainer.removeClass('ia-hidden');
			paramsContainer.createEl('h5', { text: t('modals.mcpInspector.logs.parametersTitle') });

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
					input.createEl('option', { text: t('modals.mcpInspector.logs.selectEnum'), value: '' });
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
					(input).rows = 3;
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
		const testBtn = buttonsRow.createEl('button', { text: t('modals.mcpInspector.logs.performBtn') });
		testBtn.addClass('ia-button');
		testBtn.addClass('ia-button--primary');
		testBtn.disabled = true;

		toolSelect.addEventListener('change', () => {
			testBtn.disabled = !toolSelect.value;
		});

		// Clear button
		const clearBtn = buttonsRow.createEl('button', { text: t('modals.mcpInspector.logs.clearBtn') });
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

		testBtn.addEventListener('click', () => {
			void (async () => {
				if (!toolSelect.value) return;

				// Collect parameter values
			const args: Record<string, unknown> = {};
			const paramInputs = paramsContainer.querySelectorAll('input, select, textarea');

			let validationError = false;
			for (const input of Array.from(paramInputs)) {
				const paramName = (input as HTMLElement).dataset.paramName;
				const paramType = (input as HTMLElement).dataset.paramType;
				const required = (input as HTMLElement).dataset.required === 'true';

				if (!paramName) continue;

					let value: string | boolean | undefined;
					if (input instanceof HTMLInputElement && input.type === 'checkbox') {
						value = input.checked;
					} else if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
						value = input.value;
				}

				// Validate required fields
				if (required && !value) {
					new Notice(t('modals.mcpInspector.logs.notices.requiredMissing', { name: paramName }));
					validationError = true;
					break;
				}

				// Skip empty optional fields
				if (!value) continue;

					// Parse based on type
					try {
						if (paramType === 'number') {
							if (typeof value !== 'string') {
								new Notice(t('modals.mcpInspector.logs.notices.invalidNumber', { name: paramName }));
								validationError = true;
								break;
							}
							const parsed = Number.parseFloat(value);
							if (Number.isNaN(parsed)) {
								new Notice(t('modals.mcpInspector.logs.notices.invalidNumber', { name: paramName }));
								validationError = true;
								break;
							}
							args[paramName] = parsed;
						} else if (paramType === 'boolean') {
							args[paramName] = value;
						} else if (paramType === 'object' || paramType === 'array') {
							if (typeof value !== 'string') {
								new Notice(t('modals.mcpInspector.logs.notices.invalidJson', { name: paramName }));
								validationError = true;
								break;
							}
							args[paramName] = JSON.parse(value);
						} else {
							args[paramName] = value;
						}
					} catch (error) {
					console.error(`Invalid JSON for parameter ${paramName}:`, error);
					new Notice(t('modals.mcpInspector.logs.notices.invalidJson', { name: paramName }));
					validationError = true;
					break;
				}
			}

			if (validationError) return;

			// Execute tool
			testBtn.disabled = true;
			testBtn.textContent = t('modals.mcpInspector.logs.executing');
			resultContainer.addClass('ia-hidden');

			try {
				const result = await inspectorRegistry.executeTool(toolSelect.value, args);

				// Display result
				resultContainer.empty();
				resultContainer.removeClass('ia-hidden');

				const header = resultContainer.createEl('div');
				header.setCssProps({ 'margin-bottom': '8px' });
				header.setCssProps({ 'font-weight': '600' });

				if (result.success) {
					header.setCssProps({ 'color': 'var(--text-success)' });
					header.setText(t('modals.mcpInspector.logs.success'));
				} else {
					header.setCssProps({ 'color': 'var(--text-error)' });
					header.setText(t('modals.mcpInspector.logs.failed'));
				}

				if (result.error) {
					const errorDiv = resultContainer.createEl('div');
					errorDiv.setCssProps({ 'color': 'var(--text-error)' });
					errorDiv.setCssProps({ 'margin-bottom': '8px' });
					errorDiv.setText(t('modals.mcpInspector.logs.errorLabel', { message: result.error }));
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

				new Notice(result.success ? t('modals.mcpInspector.logs.notices.success') : t('modals.mcpInspector.logs.notices.failed'));
			} catch (error: unknown) {
				resultContainer.empty();
				resultContainer.removeClass('ia-hidden');

				const header = resultContainer.createEl('div');
				header.setCssProps({ 'color': 'var(--text-error)' });
				header.setCssProps({ 'font-weight': '600' });
				header.setCssProps({ 'margin-bottom': '8px' });
				header.setText(t('modals.mcpInspector.logs.errorTitle'));

				const errorDiv = resultContainer.createEl('div');
				errorDiv.setText(error instanceof Error ? error.message : 'Unknown error');

				new Notice(t('modals.mcpInspector.logs.notices.error', { message: error instanceof Error ? error.message : 'Unknown error' }));
			} finally {
				testBtn.disabled = false;
				testBtn.textContent = t('modals.mcpInspector.logs.performBtn');
			}
			})();
		});

		clearBtn.addEventListener('click', () => {
			resultContainer.empty();
			resultContainer.addClass('ia-hidden');
		});
	}

	private async testAllMCPConnections() {
		const mcpServers = this.plugin.settings.mcpServers;

		if (mcpServers.length === 0) {
			new Notice(t('modals.mcpInspector.testAll.noServers'));
			return;
		}

		new Notice(t('modals.mcpInspector.testAll.testing', { count: mcpServers.length }));

		const results: {name: string, success: boolean, error?: string}[] = [];
		let settingsDirty = false;

		for (const server of mcpServers) {
			if (!server.enabled) {
				results.push({ name: server.name, success: false, error: 'Server disabled' });
				continue;
			}

			try {
				// Probe via a throw-away McpToolSource so the cache shape stays
				// consistent with what the registry would produce. Not registered.
				const probeSource = new McpToolSource(server);
				const tools = await probeSource.load();
				await probeSource.dispose();

				server.cachedTools = tools.map((t) => ({
					name: t.definition.name,
					description: t.definition.description,
				}));
				server.cacheTimestamp = Date.now();
				settingsDirty = true;

				results.push({
					name: server.name,
					success: true,
					error: undefined
				});

				console.debug(`[MCP] ${server.name} connection test: ${tools.length} tools available`);
			} catch (error: unknown) {
				console.error(`[MCP] ${server.name} connection test failed:`, error);
				results.push({
					name: server.name,
					success: false,
					error: error instanceof Error ? error.message : 'Connection failed'
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
			new Notice(t('modals.mcpInspector.testAll.allSuccess', { count: successful }));
		} else {
			new Notice(t('modals.mcpInspector.testAll.partial', { success: successful, failed }));

			// Show detailed results in console
			console.debug('[MCP] Connection test results:');
			for (const result of results) {
				console.debug(`  ${result.success ? '✅' : '❌'} ${result.name}: ${result.error || 'connected'}`);
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
