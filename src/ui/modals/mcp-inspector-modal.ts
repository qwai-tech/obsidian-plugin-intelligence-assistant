import { App, Modal, Notice, Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { RegisteredTool } from '@/features/tools';
import { getConnectedMcpServers, getToolsByProviderKey } from './mcp-inspector-data';
import { renderMcpToolTester } from './mcp-tool-tester';
import { t } from '@/i18n';

export class MCPInspectorModal extends Modal {
	private plugin: IntelligenceAssistantPlugin;

	constructor(app: App, plugin: IntelligenceAssistantPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.setTitle(t('modals.mcpInspector.title'));
		const descEl = contentEl.createEl('p', {
			text: t('modals.mcpInspector.desc')
		});
		descEl.addClass('ia-mcpi-desc');

		// Create tabs for different views
		const tabContainer = contentEl.createDiv();
		tabContainer.removeClass('ia-hidden');
		tabContainer.addClass('ia-mcpi-tabbar');

		const connectionsTab = tabContainer.createEl('button', { text: t('modals.mcpInspector.tabs.connections') });
		const toolsTab = tabContainer.createEl('button', { text: t('modals.mcpInspector.tabs.tools') });
		const logsTab = tabContainer.createEl('button', { text: t('modals.mcpInspector.tabs.logs') });

		// Style tabs
		const tabs = [connectionsTab, toolsTab, logsTab];
		const setActiveTab = (activeIndex: number) => {
			tabs.forEach((tab, index) => {
				tab.toggleClass('ia-mcpi-tab--active', index === activeIndex);
			});
		};
		tabs.forEach((tab, index) => {
			tab.addClass('ia-mcpi-tab');
			tab.addClass('ia-clickable');

			// Remove border on selected side
			if (index > 0) {
				tab.addClass('ia-mcpi-tab--no-left-border');
			}

			if (index === tabs.length - 1) {
				tab.addClass('ia-mcpi-tab--last');
			} else if (index === 0) {
				tab.addClass('ia-mcpi-tab--first');
			}
		});
		setActiveTab(0);

		// Content area
		const contentContainer = contentEl.createDiv();
		contentContainer.addClass('ia-mcpi-content');

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

			setActiveTab(0);
		});

		toolsTab.addEventListener('click', () => {
			connectionsContent.addClass('ia-hidden');
			toolsContent.removeClass('ia-hidden');
			logsContent.addClass('ia-hidden');

			setActiveTab(1);
		});

		logsTab.addEventListener('click', () => {
			connectionsContent.addClass('ia-hidden');
			toolsContent.addClass('ia-hidden');
			logsContent.removeClass('ia-hidden');

			setActiveTab(2);
		});

		// Refresh button
		const refreshBtn = contentEl.createEl('button', { text: t('modals.mcpInspector.refreshBtn') });
		refreshBtn.addClass('ia-mcpi-refresh-btn');
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
		new Setting(container).setName(t('modals.mcpInspector.connections.title')).setHeading();

		// Check for active connections
		const registry = this.plugin.services.tools.registry;
		const connectedServers = getConnectedMcpServers(registry);
		const toolsByProvider = getToolsByProviderKey(registry);

		// Display configured servers
		if (this.plugin.settings.mcpServers.length === 0) {
			container.createEl('p', { text: t('modals.mcpInspector.connections.noServers') });
			return;
		}

		const table = container.createEl('table');
		table.addClass('ia-mcpi-table');

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
				statusCell.addClass('ia-mcpi-status--muted');
			} else if (isConnected) {
				statusCell.setText(t('modals.mcpInspector.connections.statusConnected'));
				statusCell.addClass('ia-mcpi-status--success');
			} else {
				statusCell.setText(t('modals.mcpInspector.connections.statusDisconnected'));
				statusCell.addClass('ia-mcpi-status--error');
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
			actionBtn.addClass('ia-mcpi-action-btn');
			actionBtn.addClass('ia-clickable');
			actionBtn.toggleClass('ia-mcpi-action-btn--disconnect', isConnected);
			actionBtn.toggleClass('ia-mcpi-action-btn--connect', !isConnected);

			actionBtn.disabled = !isEnabled;
			actionBtn.addEventListener('click', () => {
				void (async () => {
					const currentlyConnected = this.plugin.services.tools.isMcpConnected(server.name);
					actionBtn.disabled = true;
					const originalText = actionBtn.textContent ?? '';
					actionBtn.textContent = currentlyConnected ? t('modals.mcpInspector.connections.disconnecting') : t('modals.mcpInspector.connections.connecting');

					try {
						if (currentlyConnected) {
							await this.plugin.services.tools.disconnectMcp(server.name);
							new Notice(t('modals.mcpInspector.connections.notices.disconnected', { name: server.name }));
						} else {
							if (!server.enabled) {
								new Notice(t('modals.mcpInspector.connections.notices.enableFirst'));
								return;
							}
							await this.plugin.services.tools.connectMcp(server);
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
		new Setting(container).setName(t('modals.mcpInspector.tools.title')).setHeading();

		// Check for active connections
		const toolsRegistry = this.plugin.services.tools.registry;
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

			new Setting(serverSection).setName(t('modals.mcpInspector.tools.serverPrefix', { name: serverName })).setHeading();

			if (tools.length === 0) {
				serverSection.createEl('p', { text: t('modals.mcpInspector.tools.noToolsInServer') });
				continue;
			}

			const toolsTable = serverSection.createEl('table');
			toolsTable.addClass('ia-mcpi-table');

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
					paramsList.addClass('ia-mcpi-params-list');
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
		new Setting(container).setName(t('modals.mcpInspector.logs.title')).setHeading();

		// Display any stored logs or debugging information
		const logContainer = container.createDiv();
		logContainer.addClass('ia-mcpi-log-container');

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

		renderMcpToolTester(container, this.plugin.services.tools.registry);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
