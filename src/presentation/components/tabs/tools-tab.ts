/**
 * Tools Settings Tab
 * Displays built-in tools and MCP tools management
 */

import { Notice, Setting, Modal } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CachedMCPTool, OpenApiToolConfig, OpenApiAuthType, OpenApiSourceType } from '@/types';
import type { Tool } from '@/application/services/types';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';

type ToolsSubTab = 'built-in' | 'mcp' | 'openapi';

export function displayToolsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	toolsSubTab: ToolsSubTab,
	setToolsSubTab: (tab: ToolsSubTab) => void,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'Tool configuration' });

	const desc = containerEl.createEl('p', {
		text: 'Review built-in tools and explore MCP tools loaded from connected servers. Enable the actions your agents should be able to perform.'
	});
	desc.addClass('ia-section-description');

	const tabBar = containerEl.createDiv('settings-tabs');
	const tabDefs: Array<{ slug: ToolsSubTab; label: string }> = [
		{ slug: 'built-in', label: 'Built-in Tools' },
		{ slug: 'mcp', label: 'MCP tools' },
		{ slug: 'openapi', label: 'HTTP / OpenAPI' }
	];

	tabDefs.forEach(def => {
		const btn = tabBar.createEl('button', { text: def.label });
		btn.className = 'settings-tab';
		btn.dataset.slug = def.slug;
		if (def.slug === toolsSubTab) {
			btn.addClass('is-active');
		}
		btn.addEventListener('click', () => {
			setToolsSubTab(def.slug);
			Array.from(tabBar.children).forEach(el => el.removeClass('is-active'));
			btn.addClass('is-active');
			content.empty();
			switch (def.slug) {
				case 'built-in':
					renderBuiltInTools(content, plugin);
					break;
				case 'mcp':
					renderMcpTools(content, plugin, refreshDisplay);
					break;
				case 'openapi':
					renderOpenApiTools(content, plugin, refreshDisplay);
					break;
			}
		});
	});

	const content = containerEl.createDiv('settings-tab-content');
	switch (toolsSubTab) {
		case 'built-in':
			renderBuiltInTools(content, plugin);
			break;
		case 'mcp':
			renderMcpTools(content, plugin, refreshDisplay);
			break;
		case 'openapi':
			renderOpenApiTools(content, plugin, refreshDisplay);
			break;
	}
}

/**
 * Render built-in tools table
 */
function renderBuiltInTools(content: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const toolMetadata: Record<string, {
		category: string;
		description: string;
		parameters: string;
		icon: string;
	}> = {
		'read_file': { category: 'File Operations', description: 'Read the contents of a file from your vault', parameters: 'path (required): Path to the file to read', icon: '📖' },
		'write_file': { category: 'File Operations', description: 'Write or update a file in your vault', parameters: 'path (required), content (required): File path and content to write', icon: '✍️' },
		'list_files': { category: 'File Operations', description: 'List files in the vault or a specific folder', parameters: 'folder (optional), extension (optional): Filter by folder and file extension', icon: '📁' },
		'search_files': { category: 'Search & Discovery', description: 'Search for files by name or content in your vault', parameters: 'query (required), search_content (optional), limit (optional): Search query and options', icon: '🔍' },
		'create_note': { category: 'Note Management', description: 'Create a new note with specified content', parameters: 'title (required), content (required), folder (optional): Note title, content, and location', icon: '📝' },
		'append_to_note': { category: 'Note Management', description: 'Append content to an existing note', parameters: 'path (required), content (required): Note path and content to append', icon: '➕' }
	};

	const table = createTable(content, ['Name', 'Category', 'Description', 'Parameters', 'Enabled']);
	const tbody = table.tBodies[0];

	plugin.settings.builtInTools.forEach(tool => {
		const metadata = toolMetadata[tool.type];
		if (!metadata) {
			return;
		}

		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameDiv = nameCell.createDiv('tool-name');
		nameDiv.createSpan('tool-icon').setText(metadata.icon);
		nameDiv.createSpan().setText(tool.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

		const categoryCell = row.insertCell();
		categoryCell.addClass('ia-table-cell');
		categoryCell.addClass('ia-table-subtext');
		categoryCell.setText(metadata.category);

		const descCell = row.insertCell();
		descCell.addClass('ia-table-cell');
		descCell.setText(metadata.description);

		const paramsCell = row.insertCell();
		paramsCell.addClass('ia-table-cell');
		paramsCell.addClass('ia-table-subtext');
		paramsCell.setText(metadata.parameters);

		const enabledCell = row.insertCell();
		enabledCell.addClass('ia-table-cell');
		enabledCell.addClass('ia-table-cell--center');

		const toggle = enabledCell.createEl('input', { type: 'checkbox' });
		toggle.checked = tool.enabled;
		toggle.addEventListener('change', () => {
			void (async () => {
				tool.enabled = toggle.checked;
				await plugin.saveSettings();
				plugin.syncToolManagerConfig();
			})();
		});
	});

	const infoBox = content.createDiv('info-callout');
	const infoTitle = infoBox.createEl('h5', { text: '💡 about tools' });
	infoTitle.addClass('info-callout-title');

	const infoText = infoBox.createEl('p', {
		text: 'Built-in tools are configured per plugin settings. MCP tools are managed independently—use the MCP tab to connect servers and refresh tool availability.'
	});
	infoText.addClass('table-subtext');
}

/**
 * Render MCP tools table with filters
 */
function renderMcpTools(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	_refreshDisplay: () => void
): void {
	const toolManager = plugin.getToolManager();
	const toolsByProvider = toolManager.getToolsByProvider();
	const connectedServers = new Set<string>(toolManager.getMCPServers());

	const rows: Array<{ serverName: string; name: string; description: string; parameters: string; isLive: boolean }> = [];

	const formatLiveParams = (tool: Tool): string => {
		if (!tool.definition.parameters.length) {
			return '—';
		}
		return tool.definition.parameters
			.map(param => `${param.name}${param.required ? '*' : ''}: ${param.type}`)
			.join(', ');
	};

	const formatCachedParams = (cached?: CachedMCPTool): string => {
		const schema = cached?.inputSchema;
		if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
			return 'Schema unavailable';
		}
		const requiredSet = new Set(schema.required ?? []);
		return Object.entries(schema.properties)
			.map(([key, value]: [string, unknown]) => {
				const propValue = value as { type?: string };
				const type = propValue?.type ?? 'unknown';
				return `${key}${requiredSet.has(key) ? '*' : ''}: ${type}`;
			})
			.join(', ');
	};

	for (const server of plugin.settings.mcpServers) {
		const liveTools = toolsByProvider.get(`mcp:${server.name}`) || [];
		const cachedTools = server.cachedTools ?? [];
		const merged = new Map<string, { description: string; parameters: string; isLive: boolean }>();

		for (const cached of cachedTools) {
			merged.set(cached.name, {
				description: cached.description ?? 'No description',
				parameters: formatCachedParams(cached),
				isLive: false
			});
		}

		for (const tool of liveTools) {
			merged.set(tool.definition.name, {
				description: tool.definition.description || 'No description',
				parameters: formatLiveParams(tool),
				isLive: true
			});
		}

		for (const [name, detail] of merged.entries()) {
			rows.push({
				serverName: server.name,
				name,
				description: detail.description,
				parameters: detail.parameters,
				isLive: detail.isLive
			});
		}
	}

	const hasRows = rows.length > 0;

	if (!hasRows) {
		const note = content.createEl('p');
		note.addClass('ia-table-subtext');
		note.setText('No MCP tools available. Connect a server or refresh cached tools to populate this list.');
		return;
	}

	rows.sort((a, b) => a.serverName.localeCompare(b.serverName) || a.name.localeCompare(b.name));

	const table = createTable(content, ['Server', 'Tool', 'Description', 'Parameters', 'Source']);
	const tbody = table.tBodies[0];
	let currentServer: string | null = null;

	for (const row of rows) {
		const tr = tbody.insertRow();
		tr.addClass('ia-table-row');
		const serverCell = tr.insertCell();
		serverCell.addClass('ia-table-cell');

		if (row.serverName !== currentServer) {
			const serverStack = serverCell.createDiv('ia-table-stack');
			serverStack.createDiv('ia-table-title').setText(row.serverName);
			const statusHost = serverStack.createDiv();
			const isConnected = connectedServers.has(row.serverName);
			createStatusIndicator(statusHost, isConnected ? 'success' : 'warning', isConnected ? 'connected' : 'disconnected');
			currentServer = row.serverName;
		} else {
			serverCell.setText('');
		}

		const toolCell = tr.insertCell();
		toolCell.addClass('ia-table-cell');
		toolCell.setText(row.name);

		const descCell = tr.insertCell();
		descCell.addClass('ia-table-cell');
		descCell.setText(row.description);

		const paramsCell = tr.insertCell();
		paramsCell.addClass('ia-table-cell');
		paramsCell.addClass('ia-table-subtext');
		paramsCell.setText(row.parameters);

		const sourceCell = tr.insertCell();
		sourceCell.addClass('ia-table-cell');
		sourceCell.addClass('ia-table-subtext');
		sourceCell.setText(row.isLive ? 'Live' : 'Cached');
	}
}

function renderOpenApiTools(content: HTMLElement, plugin: IntelligenceAssistantPlugin, refreshDisplay: () => void): void {
	if (!Array.isArray(plugin.settings.openApiTools)) {
		plugin.settings.openApiTools = [];
	}
	const configs = plugin.settings.openApiTools;
	const cacheDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/data/openapi/`;
	content.createEl('p', {
		text: `Generate HTTP tools from OpenAPI documents. Remote specs are cached under ${cacheDir}.`,
	}).addClass('ia-table-subtext');

	const addButton = content.createEl('button', { text: 'Add HTTP source' });
	addButton.addClass('mod-cta');
	addButton.addEventListener('click', () => {
		void (async () => {
			const newConfig = createDefaultOpenApiConfig();
			plugin.settings.openApiTools.push(newConfig);
			await plugin.saveSettings();
			new OpenApiConfigModal(plugin, newConfig, refreshDisplay).open();
		})();
	});

	if (configs.length === 0) {
		content.createEl('p', { text: 'No HTTP sources configured yet.' }).addClass('ia-table-subtext');
		return;
	}

	const table = createTable(content, ['Name', 'Source', 'Auth', 'Status', 'Actions']);
	const tbody = table.tBodies[0];
	const sorted = [...configs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
	for (const config of sorted) {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		row.insertCell().setText(config.name || 'Unnamed HTTP source');
		const sourceCell = row.insertCell();
		sourceCell.addClass('ia-table-subtext');
		sourceCell.setText(formatSource(config));
		const authCell = row.insertCell();
		authCell.addClass('ia-table-subtext');
		authCell.setText(formatAuth(config));
		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-subtext');
		statusCell.setText(config.enabled ? 'Enabled' : 'Disabled');

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-cell--actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addEventListener('click', () => new OpenApiConfigModal(plugin, config, refreshDisplay).open());

		const reloadBtn = actionsCell.createEl('button', { text: 'Reload' });
		reloadBtn.addEventListener('click', () => { void reloadConfig(plugin, config.id, false, refreshDisplay); });

		if (config.sourceType === 'url') {
			const refetchBtn = actionsCell.createEl('button', { text: 'Refetch' });
			refetchBtn.addEventListener('click', () => { void reloadConfig(plugin, config.id, true, refreshDisplay); });
		}

		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('mod-warning');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				const list = plugin.settings.openApiTools;
				const index = list.findIndex(entry => entry.id === config.id);
				if (index !== -1) {
					list.splice(index, 1);
					await plugin.saveSettings();
					await plugin.removeOpenApiConfig(config.id);
					refreshDisplay();
					new Notice('HTTP source removed');
				}
			})();
		});
	}
}

function formatSource(config: OpenApiToolConfig): string {
	return config.sourceType === 'url'
		? config.specUrl?.trim() || 'Remote URL not set'
		: config.specPath?.trim() || 'File path not set';
}

function formatAuth(config: OpenApiToolConfig): string {
	switch (config.authType) {
		case 'header':
			return `Header (${config.authKey || 'n/a'})`;
		case 'query':
			return `Query (${config.authKey || 'n/a'})`;
		default:
			return 'None';
	}
}

async function reloadConfig(
	plugin: IntelligenceAssistantPlugin,
	configId: string,
	forceRefetch: boolean,
	refreshDisplay: () => void
): Promise<void> {
	try {
		const loaded = await plugin.reloadOpenApiConfig(configId, {
			forceRefetch,
			persistCacheMetadata: forceRefetch,
		});
		await plugin.saveSettings();
		refreshDisplay();
		new Notice(`Reloaded ${loaded} operations`);
	} catch (error) {
		console.error('[OpenAPI] Failed to reload tools', error);
		new Notice('Failed to reload HTTP source. Check the console for details.');
	}
}

function createDefaultOpenApiConfig(): OpenApiToolConfig {
	const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `openapi-${Math.random().toString(36).slice(2, 10)}`;
	return {
		id,
		name: 'New HTTP Source',
		enabled: false,
		sourceType: 'file',
		specPath: '',
		specUrl: '',
		baseUrl: '',
		authType: 'none',
		authKey: '',
		authValue: ''
	};
}

class OpenApiConfigModal extends Modal {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly config: OpenApiToolConfig,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.config.name || 'HTTP Source' });

		const persist = async () => {
			await this.plugin.saveSettings();
			this.onChange();
		};

		const reload = async (forceRefetch = false) => {
			await reloadConfig(this.plugin, this.config.id, forceRefetch, this.onChange);
		};

		new Setting(contentEl)
			.setName('Display name')
			.setDesc('Shown to agents when choosing a tool source')
			.addText(text => {
				text.setPlaceholder('HTTP Source')
					.setValue(this.config.name ?? '')
					.onChange(value => {
						this.config.name = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName('Enabled')
			.setDesc('Enable to expose this HTTP API to every agent')
			.addToggle(toggle => toggle
				.setValue(Boolean(this.config.enabled))
				.onChange(async (value) => {
					this.config.enabled = value;
					await persist();
					await reload(false);
				}));

		new Setting(contentEl)
			.setName('Source type')
			.addDropdown(dropdown => {
				dropdown.addOption('file', 'Local file');
				dropdown.addOption('url', 'Remote URL');
				dropdown.setValue(this.config.sourceType ?? 'file')
					.onChange(async (value) => {
						this.config.sourceType = value as OpenApiSourceType;
						if (this.config.sourceType === 'file') {
							this.config.specUrl = '';
						} else {
							this.config.specPath = '';
						}
						await persist();
						this.close();
						new OpenApiConfigModal(this.plugin, this.config, this.onChange).open();
					});
			});

		if (this.config.sourceType === 'url') {
			new Setting(contentEl)
				.setName('OpenAPI URL')
				.setDesc('Fetched and cached inside the plugin data directory')
				.addText(text => {
					text.setPlaceholder('https://example.com/openapi.json')
						.setValue(this.config.specUrl ?? '')
						.onChange(value => {
							this.config.specUrl = value.trim();
						});
					text.inputEl.onblur = () => { void persist(); };
				});
			const cachePath = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data/openapi/${this.config.id}.json`;
			const lastFetched = this.config.lastFetchedAt ? new Date(this.config.lastFetchedAt).toLocaleString() : 'Never fetched';
			contentEl.createEl('p', { text: `Cached file: ${cachePath} (${lastFetched})` }).addClass('ia-table-subtext');
		} else {
			new Setting(contentEl)
				.setName('OpenAPI file path')
				.setDesc('Relative path inside the vault or an absolute path')
				.addText(text => {
					text.setPlaceholder('integrations/openapi.json')
						.setValue(this.config.specPath ?? '')
						.onChange(value => {
							this.config.specPath = value.trim();
						});
					text.inputEl.onblur = () => { void persist(); };
				});
		}

		new Setting(contentEl)
			.setName('Base URL override')
			.setDesc('Override the first server entry from the document (optional)')
			.addText(text => {
				text.setPlaceholder('https://api.example.com')
					.setValue(this.config.baseUrl ?? '')
					.onChange(value => {
						this.config.baseUrl = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName('Authentication')
			.setDesc('Automatically insert API keys when calling this source')
			.addDropdown(dropdown => {
				dropdown.addOption('none', 'None');
				dropdown.addOption('header', 'HTTP header');
				dropdown.addOption('query', 'Query parameter');
				dropdown.setValue(this.config.authType ?? 'none')
					.onChange(async (value) => {
						this.config.authType = value as OpenApiAuthType;
						await persist();
					});
			});

		new Setting(contentEl)
			.setName('Credential key')
			.addText(text => {
				text.setPlaceholder(this.config.authType === 'header' ? 'Authorization' : 'api_key')
					.setValue(this.config.authKey ?? '')
					.onChange(value => {
						this.config.authKey = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName('Credential value')
			.addText(text => {
				text.setPlaceholder('sk-your-token')
					.setValue(this.config.authValue ?? '')
					.onChange(value => {
						this.config.authValue = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		const actions = new Setting(contentEl)
			.setName('Actions');
		actions.addButton(button => {
			button.setButtonText('Reload tools')
				.onClick(() => { void reload(false); });
		});

		if (this.config.sourceType === 'url') {
		actions.addExtraButton(button => {
				button.setIcon('refresh-cw')
					.setTooltip('Refetch spec from URL')
					.onClick(() => { void reload(true); });
			});
		}

			actions.addExtraButton(button => {
				button.setIcon('x')
					.setTooltip('Delete source')
					.onClick(() => {
						void (async () => {
							const list = this.plugin.settings.openApiTools;
							const index = list.findIndex(entry => entry.id === this.config.id);
							if (index !== -1) {
								list.splice(index, 1);
								await this.plugin.saveSettings();
								await this.plugin.removeOpenApiConfig(this.config.id);
								this.onChange();
								this.close();
							}
						})();
					});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
