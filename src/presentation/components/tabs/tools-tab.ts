/**
 * Tools Settings Tab
 * Displays built-in tools and MCP tools management
 */

import type IntelligenceAssistantPlugin from '@plugin';
import type { CachedMCPTool } from '@/types';
import type { RegisteredTool } from '@/types/common/tools';
import { t } from '@/i18n';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { renderBuiltinToolsSection, renderOpenapiToolsSection, renderCliToolsSection } from './tools';

type ToolsSubTab = 'built-in' | 'mcp' | 'openapi' | 'cli';

export function displayToolsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	toolsSubTab: ToolsSubTab,
	setToolsSubTab: (tab: ToolsSubTab) => void,
	refreshDisplay: () => void,
	openMcpManagement?: () => void
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
					renderBuiltinToolsSection(content, plugin);
					break;
				case 'mcp':
					renderMcpTools(content, plugin, refreshDisplay, openMcpManagement);
					break;
				case 'openapi':
					renderOpenapiToolsSection(content, plugin, refreshDisplay);
					break;
				case 'cli':
					renderCliToolsSection(content, plugin, refreshDisplay);
					break;
			}
		});
	});

	const content = containerEl.createDiv('settings-tab-content');
	switch (toolsSubTab) {
		case 'built-in':
			renderBuiltinToolsSection(content, plugin);
			break;
		case 'mcp':
			renderMcpTools(content, plugin, refreshDisplay, openMcpManagement);
			break;
		case 'openapi':
			renderOpenapiToolsSection(content, plugin, refreshDisplay);
			break;
		case 'cli':
			renderCliToolsSection(content, plugin, refreshDisplay);
			break;
	}
}

/**
 * Render MCP tools table with filters
 */
function renderMcpTools(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	_refreshDisplay: () => void,
	openMcpManagement?: () => void
): void {
	const registry = plugin.getToolRegistry();
	const allTools = registry.getTools();

	// Group by origin key
	const toolsByProvider = new Map<string, RegisteredTool[]>();
	for (const tool of allTools) {
		const key = `${tool.origin.kind}:${tool.origin.sourceId}`;
		if (!toolsByProvider.has(key)) toolsByProvider.set(key, []);
		toolsByProvider.get(key)!.push(tool);
	}

	// Connected MCP servers are those with loaded tools
	const connectedServers = new Set<string>();
	for (const tool of allTools) {
		if (tool.origin.kind === 'mcp') {
			connectedServers.add(tool.origin.sourceId);
		}
	}

	const rows: Array<{ serverName: string; name: string; description: string; parameters: string; isLive: boolean }> = [];

	const formatLiveParams = (tool: RegisteredTool): string => {
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
			merged.set(tool.llmName, {
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
		const actions = content.createDiv('ia-toolbar');
		const addBtn = actions.createEl('button', { text: t('settings.tools.mcpTools.addBtn') });
		addBtn.addClass('ia-button');
		addBtn.addClass('ia-button--primary');
		addBtn.addEventListener('click', () => {
			openMcpManagement?.();
		});

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
