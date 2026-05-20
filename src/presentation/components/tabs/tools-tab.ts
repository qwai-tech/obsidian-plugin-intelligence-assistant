/**
 * Tools Settings Tab
 * Displays built-in tools and MCP tools management
 */

import { Notice, Setting, Modal } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CachedMCPTool, OpenApiToolConfig, OpenApiAuthType, OpenApiSourceType, CLIToolConfig, CLIToolParameter } from '@/types';
import type { Tool } from '@/application/services/types';
import { t } from '@/i18n';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { DEFAULT_CLI_TIMEOUT, CLI_TOOL_DEFAULTS, getAvailablePresets, PRESET_CATEGORIES, type CLIToolPreset } from '@/types/features/cli-tools';

type ToolsSubTab = 'built-in' | 'mcp' | 'openapi' | 'cli';

export function displayToolsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	toolsSubTab: ToolsSubTab,
	setToolsSubTab: (tab: ToolsSubTab) => void,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: t('settings.tools.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.tools.desc')
	});
	desc.addClass('ia-section-description');

	const tabBar = containerEl.createDiv('settings-tabs');
	const tabDefs: Array<{ slug: ToolsSubTab; label: string }> = [
		{ slug: 'built-in', label: t('settings.tools.subTabs.builtIn') },
		{ slug: 'mcp', label: t('settings.tools.subTabs.mcp') },
		{ slug: 'openapi', label: t('settings.tools.subTabs.openapi') },
		{ slug: 'cli', label: t('settings.tools.subTabs.cli') }
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
				case 'cli':
					renderCliTools(content, plugin, refreshDisplay);
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
		case 'cli':
			renderCliTools(content, plugin, refreshDisplay);
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
		'read_file': { category: t('settings.tools.builtIn.categories.fileOps'), description: t('settings.tools.builtIn.toolMeta.readFile.desc'), parameters: t('settings.tools.builtIn.toolMeta.readFile.params'), icon: '📖' },
		'write_file': { category: t('settings.tools.builtIn.categories.fileOps'), description: t('settings.tools.builtIn.toolMeta.writeFile.desc'), parameters: t('settings.tools.builtIn.toolMeta.writeFile.params'), icon: '✍️' },
		'list_files': { category: t('settings.tools.builtIn.categories.fileOps'), description: t('settings.tools.builtIn.toolMeta.listFiles.desc'), parameters: t('settings.tools.builtIn.toolMeta.listFiles.params'), icon: '📁' },
		'search_files': { category: t('settings.tools.builtIn.categories.searchDisc'), description: t('settings.tools.builtIn.toolMeta.searchFiles.desc'), parameters: t('settings.tools.builtIn.toolMeta.searchFiles.params'), icon: '🔍' },
		'create_note': { category: t('settings.tools.builtIn.categories.noteMgmt'), description: t('settings.tools.builtIn.toolMeta.createNote.desc'), parameters: t('settings.tools.builtIn.toolMeta.createNote.params'), icon: '📝' },
		'append_to_note': { category: t('settings.tools.builtIn.categories.noteMgmt'), description: t('settings.tools.builtIn.toolMeta.appendNote.desc'), parameters: t('settings.tools.builtIn.toolMeta.appendNote.params'), icon: '➕' }
	};

	const table = createTable(content, [
		t('settings.tools.builtIn.tableHeaders.name'),
		t('settings.tools.builtIn.tableHeaders.category'),
		t('settings.tools.builtIn.tableHeaders.description'),
		t('settings.tools.builtIn.tableHeaders.parameters'),
		t('settings.tools.builtIn.tableHeaders.enabled')
	]);
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
		const fallbackName = tool.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
		nameDiv.createSpan().setText(t(`settings.tools.builtIn.toolNames.${tool.type}`, { defaultValue: fallbackName }));

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
	const infoTitle = infoBox.createEl('h5', { text: t('settings.tools.builtIn.infoTitle') });
	infoTitle.addClass('info-callout-title');

	const infoText = infoBox.createEl('p', {
		text: t('settings.tools.builtIn.infoText')
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
			return t('settings.tools.mcpTools.schemaUnavailable');
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
				description: cached.description ?? t('settings.tools.mcpTools.noDescription'),
				parameters: formatCachedParams(cached),
				isLive: false
			});
		}

		for (const tool of liveTools) {
			merged.set(tool.definition.name, {
				description: tool.definition.description || t('settings.tools.mcpTools.noDescription'),
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
		note.setText(t('settings.tools.mcpTools.noTools'));
		return;
	}

	rows.sort((a, b) => a.serverName.localeCompare(b.serverName) || a.name.localeCompare(b.name));

	const table = createTable(content, [
		t('settings.tools.mcpTools.tableHeaders.server'),
		t('settings.tools.mcpTools.tableHeaders.tool'),
		t('settings.tools.mcpTools.tableHeaders.description'),
		t('settings.tools.mcpTools.tableHeaders.parameters'),
		t('settings.tools.mcpTools.tableHeaders.source')
	]);
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
			createStatusIndicator(statusHost, isConnected ? 'success' : 'warning', isConnected ? t('settings.tools.mcpTools.status.connected') : t('settings.tools.mcpTools.status.disconnected'));
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
		sourceCell.setText(row.isLive ? t('settings.tools.mcpTools.live') : t('settings.tools.mcpTools.cached'));
	}
}

function renderOpenApiTools(content: HTMLElement, plugin: IntelligenceAssistantPlugin, refreshDisplay: () => void): void {
	if (!Array.isArray(plugin.settings.openApiTools)) {
		plugin.settings.openApiTools = [];
	}
	const configs = plugin.settings.openApiTools;
	const cacheDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/data/openapi/`;
	content.createEl('p', {
		text: t('settings.tools.openapi.desc', { cacheDir }),
	}).addClass('ia-table-subtext');

	const addButton = content.createEl('button', { text: t('settings.tools.openapi.addBtn') });
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
		content.createEl('p', { text: t('settings.tools.openapi.noSources') }).addClass('ia-table-subtext');
		return;
	}

	const table = createTable(content, [
		t('settings.tools.openapi.tableHeaders.name'),
		t('settings.tools.openapi.tableHeaders.source'),
		t('settings.tools.openapi.tableHeaders.auth'),
		t('settings.tools.openapi.tableHeaders.status'),
		t('settings.tools.openapi.tableHeaders.actions')
	]);
	const tbody = table.tBodies[0];
	const sorted = [...configs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
	for (const config of sorted) {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		row.insertCell().setText(config.name || t('settings.tools.openapi.unnamed'));
		const sourceCell = row.insertCell();
		sourceCell.addClass('ia-table-subtext');
		sourceCell.setText(formatSource(config));
		const authCell = row.insertCell();
		authCell.addClass('ia-table-subtext');
		authCell.setText(formatAuth(config));
		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-subtext');
		statusCell.setText(config.enabled ? t('settings.tools.openapi.statusEnabled') : t('settings.tools.openapi.statusDisabled'));

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-cell--actions');

		const editBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.edit') });
		editBtn.addEventListener('click', () => new OpenApiConfigModal(plugin, config, refreshDisplay).open());

		const reloadBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.reload') });
		reloadBtn.addEventListener('click', () => { void reloadConfig(plugin, config.id, false, refreshDisplay); });

		if (config.sourceType === 'url') {
			const refetchBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.refetch') });
			refetchBtn.addEventListener('click', () => { void reloadConfig(plugin, config.id, true, refreshDisplay); });
		}

		const deleteBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.delete') });
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
					new Notice(t('settings.tools.openapi.notices.removed'));
				}
			})();
		});
	}
}

function formatSource(config: OpenApiToolConfig): string {
	return config.sourceType === 'url'
		? config.specUrl?.trim() || t('settings.tools.openapi.sourceUrl')
		: config.specPath?.trim() || t('settings.tools.openapi.sourcePath');
}

function formatAuth(config: OpenApiToolConfig): string {
	switch (config.authType) {
		case 'header':
			return t('settings.tools.openapi.authHeader', { key: config.authKey || 'n/a' });
		case 'query':
			return t('settings.tools.openapi.authQuery', { key: config.authKey || 'n/a' });
		default:
			return t('settings.tools.openapi.authNone');
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
		new Notice(t('settings.tools.openapi.notices.reloaded', { count: loaded }));
	} catch (error) {
		console.error('[OpenAPI] Failed to reload tools', error);
		new Notice(t('settings.tools.openapi.notices.reloadFailed'));
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
		contentEl.createEl('h3', { text: this.config.name || t('settings.tools.openapi.modal.defaultTitle') });

		const persist = async () => {
			await this.plugin.saveSettings();
			this.onChange();
		};

		const reload = async (forceRefetch = false) => {
			await reloadConfig(this.plugin, this.config.id, forceRefetch, this.onChange);
		};

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.displayName.name'))
			.setDesc(t('settings.tools.openapi.modal.displayName.desc'))
			.addText(text => {
				text.setPlaceholder('HTTP Source')
					.setValue(this.config.name ?? '')
					.onChange(value => {
						this.config.name = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.enabled.name'))
			.setDesc(t('settings.tools.openapi.modal.enabled.desc'))
			.addToggle(toggle => toggle
				.setValue(Boolean(this.config.enabled))
				.onChange(async (value) => {
					this.config.enabled = value;
					await persist();
					await reload(false);
				}));

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.sourceType.name'))
			.addDropdown(dropdown => {
				dropdown.addOption('file', t('settings.tools.openapi.modal.sourceType.file'));
				dropdown.addOption('url', t('settings.tools.openapi.modal.sourceType.url'));
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
				.setName(t('settings.tools.openapi.modal.specUrl.name'))
				.setDesc(t('settings.tools.openapi.modal.specUrl.desc'))
				.addText(text => {
					text.setPlaceholder('https://example.com/openapi.json')
						.setValue(this.config.specUrl ?? '')
						.onChange(value => {
							this.config.specUrl = value.trim();
						});
					text.inputEl.onblur = () => { void persist(); };
				});
			const cachePath = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data/openapi/${this.config.id}.json`;
			const lastFetched = this.config.lastFetchedAt ? new Date(this.config.lastFetchedAt).toLocaleString() : t('settings.tools.openapi.modal.neverFetched');
			contentEl.createEl('p', { text: t('settings.tools.openapi.modal.cachedFile', { path: cachePath, date: lastFetched }) }).addClass('ia-table-subtext');
		} else {
			new Setting(contentEl)
				.setName(t('settings.tools.openapi.modal.specPath.name'))
				.setDesc(t('settings.tools.openapi.modal.specPath.desc'))
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
			.setName(t('settings.tools.openapi.modal.baseUrl.name'))
			.setDesc(t('settings.tools.openapi.modal.baseUrl.desc'))
			.addText(text => {
				text.setPlaceholder('https://api.example.com')
					.setValue(this.config.baseUrl ?? '')
					.onChange(value => {
						this.config.baseUrl = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.auth.name'))
			.setDesc(t('settings.tools.openapi.modal.auth.desc'))
			.addDropdown(dropdown => {
				dropdown.addOption('none', t('settings.tools.openapi.modal.auth.none'));
				dropdown.addOption('header', t('settings.tools.openapi.modal.auth.header'));
				dropdown.addOption('query', t('settings.tools.openapi.modal.auth.query'));
				dropdown.setValue(this.config.authType ?? 'none')
					.onChange(async (value) => {
						this.config.authType = value as OpenApiAuthType;
						await persist();
					});
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.credKey.name'))
			.addText(text => {
				text.setPlaceholder(this.config.authType === 'header' ? 'Authorization' : 'api_key')
					.setValue(this.config.authKey ?? '')
					.onChange(value => {
						this.config.authKey = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.credValue.name'))
			.addText(text => {
				text.setPlaceholder('sk-your-token')
					.setValue(this.config.authValue ?? '')
					.onChange(value => {
						this.config.authValue = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		const actions = new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.actions.name'));
		actions.addButton(button => {
			button.setButtonText(t('settings.tools.openapi.modal.actions.reloadTools'))
				.onClick(() => { void reload(false); });
		});

		if (this.config.sourceType === 'url') {
		actions.addExtraButton(button => {
				button.setIcon('refresh-cw')
					.setTooltip(t('settings.tools.openapi.modal.actions.refetchTooltip'))
					.onClick(() => { void reload(true); });
			});
		}

			actions.addExtraButton(button => {
				button.setIcon('x')
					.setTooltip(t('settings.tools.openapi.modal.actions.deleteTooltip'))
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

/**
 * Render CLI tools table
 */
function renderCliTools(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	refreshDisplay: () => void
): void {
	if (!Array.isArray(plugin.settings.cliTools)) {
		plugin.settings.cliTools = [];
	}
	const configs = plugin.settings.cliTools;

	content.createEl('p', {
		text: t('settings.tools.cli.desc'),
	}).addClass('ia-table-subtext');

	const buttonContainer = content.createDiv();
	buttonContainer.setCssProps({ 'display': 'flex', 'gap': '8px', 'margin-bottom': '16px' });

	const addButton = buttonContainer.createEl('button', { text: t('settings.tools.cli.addBtn') });
	addButton.addClass('mod-cta');
	addButton.addEventListener('click', () => {
		void (async () => {
			const newConfig = createDefaultCLIToolConfig();
			plugin.settings.cliTools.push(newConfig);
			await plugin.saveSettings();
			new CLIToolConfigModal(plugin, newConfig, refreshDisplay).open();
		})();
	});

	const presetButton = buttonContainer.createEl('button', { text: t('settings.tools.cli.presetsBtn') });
	presetButton.addEventListener('click', () => {
		new CLIToolPresetModal(plugin, refreshDisplay).open();
	});

	if (configs.length === 0) {
		content.createEl('p', { text: t('settings.tools.cli.noTools') }).addClass('ia-table-subtext');
		return;
	}

	const table = createTable(content, [
		t('settings.tools.cli.tableHeaders.name'),
		t('settings.tools.cli.tableHeaders.command'),
		t('settings.tools.cli.tableHeaders.parameters'),
		t('settings.tools.cli.tableHeaders.status'),
		t('settings.tools.cli.tableHeaders.actions')
	]);
	const tbody = table.tBodies[0];
	const sorted = [...configs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

	for (const config of sorted) {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameDiv = nameCell.createDiv('tool-name');
		nameDiv.createSpan('tool-icon').setText('⌨️');
		nameDiv.createSpan().setText(config.name || t('settings.tools.cli.unnamed'));

		const commandCell = row.insertCell();
		commandCell.addClass('ia-table-cell');
		commandCell.addClass('ia-table-subtext');
		const commandText = config.args?.length
			? `${config.command} ${config.args.join(' ')}`
			: config.command;
		commandCell.setText(commandText.length > 50 ? commandText.slice(0, 47) + '...' : commandText);

		const paramsCell = row.insertCell();
		paramsCell.addClass('ia-table-cell');
		paramsCell.addClass('ia-table-subtext');
		const paramCount = config.parameters?.length ?? 0;
		paramsCell.setText(paramCount > 0 ? t(paramCount === 1 ? 'settings.tools.cli.paramCount' : 'settings.tools.cli.paramCount_plural', { count: paramCount }) : t('settings.tools.cli.noParams'));

		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		createStatusIndicator(statusCell, config.enabled ? 'success' : 'warning', config.enabled ? t('settings.tools.cli.statusEnabled') : t('settings.tools.cli.statusDisabled'));

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-cell--actions');

		const editBtn = actionsCell.createEl('button', { text: t('settings.tools.cli.actions.edit') });
		editBtn.addEventListener('click', () => new CLIToolConfigModal(plugin, config, refreshDisplay).open());

		const toggleBtn = actionsCell.createEl('button', { text: config.enabled ? t('settings.tools.cli.actions.disable') : t('settings.tools.cli.actions.enable') });
		toggleBtn.addEventListener('click', () => {
			void (async () => {
				config.enabled = !config.enabled;
				await plugin.saveSettings();
				plugin.reloadCLITools();
				refreshDisplay();
			})();
		});

		const deleteBtn = actionsCell.createEl('button', { text: t('settings.tools.cli.actions.delete') });
		deleteBtn.addClass('mod-warning');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				const list = plugin.settings.cliTools;
				const index = list.findIndex(entry => entry.id === config.id);
				if (index !== -1) {
					list.splice(index, 1);
					await plugin.saveSettings();
					plugin.reloadCLITools();
					refreshDisplay();
					new Notice(t('settings.tools.cli.notices.removed'));
				}
			})();
		});
	}

	const infoBox = content.createDiv('info-callout');
	const infoTitle = infoBox.createEl('h5', { text: t('settings.tools.cli.infoTitle') });
	infoTitle.addClass('info-callout-title');

	const infoText = infoBox.createEl('p', {
		text: t('settings.tools.cli.infoText')
	});
	infoText.addClass('table-subtext');
}

function createDefaultCLIToolConfig(): CLIToolConfig {
	const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `cli-${Math.random().toString(36).slice(2, 10)}`;
	return {
		...CLI_TOOL_DEFAULTS,
		id,
		name: 'New CLI Tool',
		description: 'A command-line tool',
		command: '',
		enabled: false
	} as CLIToolConfig;
}

class CLIToolConfigModal extends Modal {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly config: CLIToolConfig,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.config.name || t('settings.tools.cli.modal.defaultTitle') });

		const persist = async () => {
			await this.plugin.saveSettings();
			this.plugin.reloadCLITools();
			this.onChange();
		};

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.toolName.name'))
			.setDesc(t('settings.tools.cli.modal.toolName.desc'))
			.addText(text => {
				text.setPlaceholder('my_tool')
					.setValue(this.config.name ?? '')
					.onChange(value => {
						this.config.name = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.description.name'))
			.setDesc(t('settings.tools.cli.modal.description.desc'))
			.addTextArea(text => {
				text.setPlaceholder('Executes a command to...')
					.setValue(this.config.description ?? '')
					.onChange(value => {
						this.config.description = value;
					});
				text.inputEl.onblur = () => { void persist(); };
				text.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.enabled.name'))
			.setDesc(t('settings.tools.cli.modal.enabled.desc'))
			.addToggle(toggle => toggle
				.setValue(Boolean(this.config.enabled))
				.onChange(async (value) => {
					this.config.enabled = value;
					await persist();
				}));

		contentEl.createEl('h4', { text: t('settings.tools.cli.modal.commandConfig') });

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.command.name'))
			.setDesc(t('settings.tools.cli.modal.command.desc'))
			.addText(text => {
				text.setPlaceholder('python')
					.setValue(this.config.command ?? '')
					.onChange(value => {
						this.config.command = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.args.name'))
			.setDesc(t('settings.tools.cli.modal.args.desc'))
			.addTextArea(text => {
				text.setPlaceholder('-c\n{{code}}')
					.setValue((this.config.args ?? []).join('\n'))
					.onChange(value => {
						this.config.args = value.split('\n').filter(line => line.trim());
					});
				text.inputEl.onblur = () => { void persist(); };
				text.inputEl.rows = 4;
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.cwd.name'))
			.setDesc(t('settings.tools.cli.modal.cwd.desc'))
			.addText(text => {
				text.setPlaceholder('/path/to/directory')
					.setValue(this.config.cwd ?? '')
					.onChange(value => {
						this.config.cwd = value.trim() || undefined;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.timeout.name'))
			.setDesc(t('settings.tools.cli.modal.timeout.desc', { timeout: DEFAULT_CLI_TIMEOUT }))
			.addText(text => {
				text.setPlaceholder(String(DEFAULT_CLI_TIMEOUT))
					.setValue(this.config.timeout ? String(this.config.timeout) : '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.config.timeout = isNaN(num) ? undefined : num;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.shell.name'))
			.setDesc(t('settings.tools.cli.modal.shell.desc'))
			.addToggle(toggle => toggle
				.setValue(this.config.shell ?? true)
				.onChange(async (value) => {
					this.config.shell = value;
					await persist();
				}));

		contentEl.createEl('h4', { text: t('settings.tools.cli.modal.paramsTitle') });
		contentEl.createEl('p', {
			text: t('settings.tools.cli.modal.paramsDesc'),
			cls: 'ia-table-subtext'
		});

		const paramsContainer = contentEl.createDiv('cli-params-container');
		this.renderParameters(paramsContainer, persist);

		const addParamBtn = contentEl.createEl('button', { text: t('settings.tools.cli.modal.addParam') });
		addParamBtn.addEventListener('click', () => {
			if (!this.config.parameters) {
				this.config.parameters = [];
			}
			this.config.parameters.push({
				name: `param${this.config.parameters.length + 1}`,
				type: 'string',
				description: '',
				required: false,
				insertAs: 'template'
			});
			this.renderParameters(paramsContainer, persist);
			void persist();
		});

		contentEl.createEl('h4', { text: t('settings.tools.cli.modal.envTitle') });
		contentEl.createEl('p', {
			text: t('settings.tools.cli.modal.envDesc'),
			cls: 'ia-table-subtext'
		});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.envVars.name'))
			.setDesc(t('settings.tools.cli.modal.envVars.desc'))
			.addTextArea(text => {
				const envStr = this.config.env
					? Object.entries(this.config.env).map(([k, v]) => `${k}=${v}`).join('\n')
					: '';
				text.setPlaceholder('MY_VAR=value\nANOTHER=value2')
					.setValue(envStr)
					.onChange(value => {
						const env: Record<string, string> = {};
						value.split('\n').forEach(line => {
							const [key, ...rest] = line.split('=');
							if (key?.trim() && rest.length > 0) {
								env[key.trim()] = rest.join('=');
							}
						});
						this.config.env = Object.keys(env).length > 0 ? env : undefined;
					});
				text.inputEl.onblur = () => { void persist(); };
				text.inputEl.rows = 3;
			});
	}

	private renderParameters(container: HTMLElement, persist: () => Promise<void>): void {
		container.empty();

		const params = this.config.parameters ?? [];
		if (params.length === 0) {
			container.createEl('p', { text: t('settings.tools.cli.modal.noParams'), cls: 'ia-table-subtext' });
			return;
		}

		for (let i = 0; i < params.length; i++) {
			const param = params[i];
			const paramDiv = container.createDiv('cli-param-item');
			paramDiv.setCssProps({
				'margin-bottom': '1em',
				'padding': '0.5em',
				'border': '1px solid var(--background-modifier-border)',
				'border-radius': '4px'
			});

			const headerDiv = paramDiv.createDiv();
			headerDiv.setCssProps({
				'display': 'flex',
				'justify-content': 'space-between',
				'align-items': 'center',
				'margin-bottom': '0.5em'
			});

			headerDiv.createEl('strong', { text: t('settings.tools.cli.modal.paramN', { n: i + 1 }) });

			const removeBtn = headerDiv.createEl('button', { text: '✕' });
			removeBtn.setCssProps({ 'padding': '2px 6px' });
			removeBtn.addEventListener('click', () => {
				params.splice(i, 1);
				this.renderParameters(container, persist);
				void persist();
			});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.name'))
				.addText(text => {
					text.setValue(param.name)
						.onChange(value => { param.name = value; });
					text.inputEl.onblur = () => { void persist(); };
				});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.type.name'))
				.addDropdown(dropdown => {
					dropdown.addOption('string', t('settings.tools.cli.modal.param.type.string'));
					dropdown.addOption('number', t('settings.tools.cli.modal.param.type.number'));
					dropdown.addOption('boolean', t('settings.tools.cli.modal.param.type.boolean'));
					dropdown.setValue(param.type)
						.onChange(value => {
							param.type = value as 'string' | 'number' | 'boolean';
							void persist();
						});
				});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.description'))
				.addText(text => {
					text.setValue(param.description)
						.onChange(value => { param.description = value; });
					text.inputEl.onblur = () => { void persist(); };
				});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.required'))
				.addToggle(toggle => toggle
					.setValue(param.required ?? false)
					.onChange(value => {
						param.required = value;
						void persist();
					}));

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.insertAs.name'))
				.setDesc(t('settings.tools.cli.modal.param.insertAs.desc'))
				.addDropdown(dropdown => {
					dropdown.addOption('template', 'Template ({{name}})');
					dropdown.addOption('arg', t('settings.tools.cli.modal.param.insertAs.arg'));
					dropdown.addOption('env', t('settings.tools.cli.modal.param.insertAs.env'));
					dropdown.setValue(param.insertAs ?? 'template')
						.onChange(value => {
							param.insertAs = value as 'template' | 'arg' | 'env';
							void persist();
						});
				});

			if (param.insertAs === 'env') {
				new Setting(paramDiv)
					.setName(t('settings.tools.cli.modal.param.envName.name'))
					.setDesc(t('settings.tools.cli.modal.param.envName.desc'))
					.addText(text => {
						text.setPlaceholder(param.name.toUpperCase())
							.setValue(param.envName ?? '')
							.onChange(value => {
								param.envName = value.trim() || undefined;
							});
						text.inputEl.onblur = () => { void persist(); };
					});
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Modal for selecting CLI tool presets
 */
class CLIToolPresetModal extends Modal {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: t('settings.tools.cli.presets.title') });

		contentEl.createEl('p', {
			text: t('settings.tools.cli.presets.desc'),
			cls: 'ia-table-subtext'
		});

		const presets = getAvailablePresets();
		const existingNames = new Set(this.plugin.settings.cliTools?.map(tool => tool.name) ?? []);

		// Group presets by category
		const categories = new Map<string, CLIToolPreset[]>();
		for (const preset of presets) {
			const cat = preset.category;
			if (!categories.has(cat)) {
				categories.set(cat, []);
			}
			categories.get(cat)!.push(preset);
		}

		// Render each category
		for (const [category, categoryPresets] of categories) {
			const categoryName = t(`settings.tools.cli.presets.categories.${category}`, { defaultValue: PRESET_CATEGORIES[category as keyof typeof PRESET_CATEGORIES] || category });
			contentEl.createEl('h4', { text: categoryName });

			const categoryContainer = contentEl.createDiv('cli-preset-category');

			for (const preset of categoryPresets) {
				const isAlreadyAdded = existingNames.has(preset.config.name);

				const presetDiv = categoryContainer.createDiv('cli-preset-item');
				presetDiv.setCssProps({
					'display': 'flex',
					'justify-content': 'space-between',
					'align-items': 'center',
					'padding': '8px 12px',
					'margin-bottom': '4px',
					'background': 'var(--background-secondary)',
					'border-radius': '4px'
				});

				const infoDiv = presetDiv.createDiv();
				infoDiv.createEl('strong', { text: t(`settings.tools.cli.presets.names.${preset.id}`, { defaultValue: preset.name }) });
				infoDiv.createEl('div', {
					text: preset.config.description,
					cls: 'ia-table-subtext'
				});
				const commandDiv = infoDiv.createEl('code', {
					text: `${preset.config.command} ${(preset.config.args ?? []).join(' ')}`.trim()
				});
				commandDiv.setCssProps({ 'font-size': '11px', 'color': 'var(--text-muted)' });

				const addBtn = presetDiv.createEl('button', {
					text: isAlreadyAdded ? t('settings.tools.cli.presets.addedBtn') : t('settings.tools.cli.presets.addBtn')
				});
				if (isAlreadyAdded) {
					addBtn.disabled = true;
					addBtn.setCssProps({ 'opacity': '0.5' });
				} else {
					addBtn.addClass('mod-cta');
					addBtn.addEventListener('click', () => {
						void this.addPreset(preset, addBtn);
					});
				}
			}
		}

		// Add close button
		const footer = contentEl.createDiv();
		footer.setCssProps({ 'margin-top': '16px', 'text-align': 'right' });
		const closeBtn = footer.createEl('button', { text: t('settings.tools.cli.presets.closeBtn') });
		closeBtn.addEventListener('click', () => this.close());
	}

	private async addPreset(preset: CLIToolPreset, button: HTMLButtonElement): Promise<void> {
		const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `cli-${Math.random().toString(36).slice(2, 10)}`;

		const newConfig: CLIToolConfig = {
			...CLI_TOOL_DEFAULTS,
			...preset.config,
			id,
			enabled: false // Start disabled so user can review
		} as CLIToolConfig;

		if (!this.plugin.settings.cliTools) {
			this.plugin.settings.cliTools = [];
		}
		this.plugin.settings.cliTools.push(newConfig);
		await this.plugin.saveSettings();
		this.plugin.reloadCLITools();
		this.onChange();

		// Update button state
		button.textContent = t('settings.tools.cli.presets.addedBtn');
		button.disabled = true;
		button.removeClass('mod-cta');
		button.setCssProps({ 'opacity': '0.5' });

		new Notice(t('settings.tools.cli.presets.notices.added', { name: preset.name }));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
