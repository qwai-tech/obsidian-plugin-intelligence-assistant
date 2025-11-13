/**
 * Tools Settings Tab
 * Displays built-in tools and MCP tools management
 */

import type IntelligenceAssistantPlugin from '@plugin';
import type { CachedMCPTool } from '@/types';
import type { Tool } from '@/application/services/types';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';

export function displayToolsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	toolsSubTab: 'built-in' | 'mcp',
	setToolsSubTab: (tab: 'built-in' | 'mcp') => void,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'Tool Configuration' });

	const desc = containerEl.createEl('p', {
		text: 'Review built-in tools and explore MCP tools loaded from connected servers. Enable the actions your agents should be able to perform.'
	});
	desc.addClass('ia-section-description');

	const tabBar = containerEl.createDiv('settings-tabs');
	const tabDefs: Array<{ slug: 'built-in' | 'mcp'; label: string }> = [
		{ slug: 'built-in', label: 'Built-In Tools' },
		{ slug: 'mcp', label: 'MCP Tools' }
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
			if (def.slug === 'built-in') {
				renderBuiltInTools(content, plugin);
			} else {
				renderMcpTools(content, plugin, refreshDisplay);
			}
		});
	});

	const content = containerEl.createDiv('settings-tab-content');
	if (toolsSubTab === 'built-in') {
		renderBuiltInTools(content, plugin);
	} else {
		renderMcpTools(content, plugin, refreshDisplay);
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
		toggle.addEventListener('change', async () => {
			tool.enabled = toggle.checked;
			await plugin.saveSettings();
			plugin.syncToolManagerConfig();
		});
	});

	const infoBox = content.createDiv('info-callout');
	const infoTitle = infoBox.createEl('h5', { text: '💡 About Tools' });
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
			.map(([key, value]: [string, any]) => {
				const type = value?.type ?? 'unknown';
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
			createStatusIndicator(statusHost, isConnected ? 'success' : 'warning', isConnected ? 'Connected' : 'Disconnected');
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
