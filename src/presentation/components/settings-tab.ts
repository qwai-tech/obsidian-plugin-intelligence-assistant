import {App, Notice, PluginSettingTab} from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { snapshotMcpTools } from '@plugin';
import type { } from './types';
import type {  } from '@/application/services/types';
import {
					AgentEditModal
} from './modals';

import { } from '../views/chat-view';
import { } from '@/constants';
import { } from '../utils/ui-helpers';
import { displayGeneralTab } from './tabs/general-tab';
import { displayWebSearchTab } from './tabs/websearch-tab';
import { displayPromptsTab } from './tabs/prompts-tab';
import { displayToolsTab } from './tabs/tools-tab';
import { displayAgentsTab } from './tabs/agents-tab';
import { displayMCPTab } from './tabs/mcp-tab';
import { displayProviderTab } from './tabs/provider-tab';
import { displayRAGTab } from './tabs/rag-tab';
import { displayModelsTab, type ModelFilters } from './tabs/models-tab';


export class IntelligenceAssistantSettingTab extends PluginSettingTab {
	plugin: IntelligenceAssistantPlugin;
	private activeTab: string = 'general';
	private modelProviderFilter: string = 'all';
	private modelCapabilityFilter: string = 'all';
	private modelEnabledFilter: 'all' | 'enabled' | 'disabled' = 'all';
	private modelSearchTerm: string = '';
	private mcpToolsServerFilter: string = 'all';
	private mcpToolsSearchTerm: string = '';
	private toolsSubTab: 'built-in' | 'mcp' = 'built-in';
	private ragSubTab: 'general' | 'vector' | 'grader' = 'general';
	private ragIndexModePill?: HTMLElement;
	private ragIndexModeMetric?: HTMLElement;

	constructor(app: App, plugin: IntelligenceAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Intelligence Assistant Settings' });

		const tabNav = containerEl.createDiv('settings-tabs');
		const tabDefs: Array<{ slug: string; label: string }> = [
			{ slug: 'general', label: 'General' },
			{ slug: 'provider', label: 'Provider' },
			{ slug: 'models', label: 'Models' },
			{ slug: 'mcp', label: 'MCP' },
			{ slug: 'tools', label: 'Tools' },
			{ slug: 'rag', label: 'RAG' },
			{ slug: 'websearch', label: 'Web Search' },
			{ slug: 'prompts', label: 'Prompts' },
			{ slug: 'agents', label: 'Agents' }
		];

		const tabContent = containerEl.createDiv('settings-tab-content');

		tabDefs.forEach(def => {
			const btn = tabNav.createEl('button', { text: def.label });
			btn.className = 'settings-tab';
			btn.dataset.slug = def.slug;
			if (def.slug === this.activeTab) {
				btn.addClass('is-active');
			}
			btn.addEventListener('click', () => {
				this.switchTab(def.slug, tabNav.querySelectorAll('.settings-tab'), tabContent);
			});
		});

		const initial = tabDefs.find(def => def.slug === this.activeTab) ?? tabDefs[0];
		this.switchTab(initial.slug, tabNav.querySelectorAll('.settings-tab'), tabContent);
	}

	private switchTab(slug: string, allTabs: NodeListOf<Element>, contentEl: HTMLElement) {
		this.activeTab = slug;
		allTabs.forEach(tab => {
			if ((tab as HTMLElement).dataset.slug === slug) {
				tab.addClass('is-active');
			} else {
				tab.removeClass('is-active');
			}
		});

		contentEl.empty();

		switch (slug) {
			case 'general':
				this.displayGeneralTab(contentEl);
				break;
			case 'provider':
				this.displayProviderTab(contentEl);
				break;
			case 'models':
				this.displayModelsTab(contentEl);
				break;
			case 'mcp':
				this.displayMCPTab(contentEl);
				break;
			case 'tools':
				this.displayToolsTab(contentEl);
				break;
			case 'rag':
				this.displayRAGTab(contentEl);
				break;
			case 'websearch':
				this.displayWebSearchTab(contentEl);
				break;
			case 'prompts':
				this.displayPromptsTab(contentEl);
				break;
			case 'agents':
				this.displayAgentsTab(contentEl);
				break;
		}
	}

	private displayGeneralTab(containerEl: HTMLElement) {
		displayGeneralTab(containerEl, this.plugin);
	}
	
	private displayProviderTab(containerEl: HTMLElement) {
		displayProviderTab(
			containerEl,
			this.plugin,
			this.app,
			() => this.display()
		);
	}

	private async displayModelsTab(containerEl: HTMLElement) {
		const filters: ModelFilters = {
			providerFilter: this.modelProviderFilter,
			capabilityFilter: this.modelCapabilityFilter,
			enabledFilter: this.modelEnabledFilter,
			searchTerm: this.modelSearchTerm
		};

		const onFilterChange = (newFilters: Partial<ModelFilters>) => {
			if (newFilters.providerFilter !== undefined) this.modelProviderFilter = newFilters.providerFilter;
			if (newFilters.capabilityFilter !== undefined) this.modelCapabilityFilter = newFilters.capabilityFilter;
			if (newFilters.enabledFilter !== undefined) this.modelEnabledFilter = newFilters.enabledFilter;
			if (newFilters.searchTerm !== undefined) this.modelSearchTerm = newFilters.searchTerm;
		};

		displayModelsTab(
			containerEl,
			this.plugin,
			filters,
			onFilterChange,
			() => this.display()
		);
	}


	private displayMCPTab(containerEl: HTMLElement) {
		displayMCPTab(
			containerEl,
			this.plugin,
			this.app,
			() => this.testAllMCPConnections(),
			() => this.display()
		);
	}

	private displayToolsTab(containerEl: HTMLElement) {
		displayToolsTab(
			containerEl,
			this.plugin,
			this.toolsSubTab,
			(tab) => { this.toolsSubTab = tab; },
			() => this.display()
		);
	}

	private displayWebSearchTab(containerEl: HTMLElement) {
		displayWebSearchTab(containerEl, this.plugin);
	}

	private displayPromptsTab(containerEl: HTMLElement) {
		displayPromptsTab(containerEl, this.plugin, this.app, () => this.display());
	}

	private displayAgentsTab(containerEl: HTMLElement) {
		displayAgentsTab(containerEl, this.plugin, this.app, () => this.display());
	}

	private displayRAGTab(containerEl: HTMLElement) {
		displayRAGTab(containerEl, this.plugin);
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

		this.display();
	}

}

// MCP Inspector Modal
