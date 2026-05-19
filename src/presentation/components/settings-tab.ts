import {App, Notice, PluginSettingTab} from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { snapshotMcpTools } from '@plugin';
import type { } from './types';
import type {  } from '@/application/services/types';

import { } from '../views/chat-view';
import { } from '@/constants';
import { } from '../utils/ui-helpers';
import { displayGeneralTab } from './tabs/general-tab';
import { displayPromptsTab } from './tabs/prompts-tab';
import { displayToolsTab } from './tabs/tools-tab';
import { displayAgentsTab } from './tabs/agents-tab';
import { displayMCPTab } from './tabs/mcp-tab';
import { displayLLMTab } from './tabs/llm-tab';
import { displayRAGTab } from './tabs/rag-tab';
import { displayQuickActionsTab } from './tabs/quickactions-tab';
import { displayUsageTab } from './tabs/usage-tab';
import type { ModelFilters } from './tabs/models-tab';


export class IntelligenceAssistantSettingTab extends PluginSettingTab {
	plugin: IntelligenceAssistantPlugin;
	private activeTab: string = 'general';
	private modelProviderFilter: string = 'all';
	private modelCapabilityFilter: string = 'all';
	private modelEnabledFilter: 'all' | 'enabled' | 'disabled' = 'all';
	private modelSearchTerm: string = '';
	private llmSubTab: 'provider' | 'models' = 'provider';
	private mcpToolsServerFilter: string = 'all';
	private mcpToolsSearchTerm: string = '';
	private toolsSubTab: 'built-in' | 'mcp' | 'openapi' | 'cli' = 'built-in';
	// cliAgentsSubTab removed — single-tier UI
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

		const layout = containerEl.createDiv('settings-layout');
		const sidebar = layout.createDiv('settings-sidebar');
		const tabContent = layout.createDiv('settings-tab-content');

		const groups: Array<{ label: string; tabs: Array<{ slug: string; label: string }> }> = [
			{ label: 'General', tabs: [
				{ slug: 'general', label: 'General' },
			]},
			{ label: 'AI', tabs: [
				{ slug: 'llm', label: 'LLM' },
				{ slug: 'mcp', label: 'MCP' },
				{ slug: 'tools', label: 'Tools' },
				{ slug: 'agents', label: 'Agents' },
			]},
			{ label: 'Knowledge', tabs: [
				{ slug: 'rag', label: 'RAG' },
				{ slug: 'prompts', label: 'Prompts' },
			]},
			{ label: 'Other', tabs: [
				{ slug: 'quickactions', label: 'Quick Actions' },
				{ slug: 'usage', label: 'Usage' },
			]},
		];

		const allBtns: HTMLElement[] = [];

		groups.forEach(group => {
			const section = sidebar.createDiv('settings-sidebar-section');
			section.createDiv({ cls: 'settings-sidebar-label', text: group.label });
			group.tabs.forEach(def => {
				const btn = section.createEl('button', { text: def.label, cls: 'settings-tab' });
				btn.dataset.slug = def.slug;
				if (def.slug === this.activeTab) btn.addClass('is-active');
				allBtns.push(btn);
				btn.addEventListener('click', () => {
					this.switchTab(def.slug, allBtns, tabContent);
				});
			});
		});

		this.switchTab(this.activeTab, allBtns, tabContent);
	}

	private switchTab(slug: string, allTabs: HTMLElement[], contentEl: HTMLElement) {
		this.activeTab = slug;
		allTabs.forEach(tab => {
			if (tab.dataset.slug === slug) {
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
			case 'llm':
				this.displayLLMTab(contentEl);
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
			case 'prompts':
				this.displayPromptsTab(contentEl);
				break;
			case 'agents':
				this.displayAgentsTab(contentEl);
				break;
			case 'quickactions':
				this.displayQuickActionsTab(contentEl);
				break;
			case 'usage':
				this.displayUsageTab(contentEl);
				break;
		}
	}

	private displayGeneralTab(containerEl: HTMLElement) {
		displayGeneralTab(containerEl, this.plugin);
	}

	private displayLLMTab(containerEl: HTMLElement) {
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

		displayLLMTab(
			containerEl,
			this.plugin,
			this.app,
			filters,
			onFilterChange,
			() => this.display(),
			this.llmSubTab,
			(tab) => { this.llmSubTab = tab; }
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

	private displayPromptsTab(containerEl: HTMLElement) {
		displayPromptsTab(containerEl, this.plugin, this.app, () => this.display());
	}

	private displayRAGTab(containerEl: HTMLElement) {
		displayRAGTab(containerEl, this.plugin);
	}

	private displayAgentsTab(containerEl: HTMLElement) {
		displayAgentsTab(containerEl, this.plugin, this.app, () => this.display());
	}

	private displayUsageTab(containerEl: HTMLElement) {
		void displayUsageTab(containerEl, this.plugin, this.app, () => this.display());
	}

	private displayQuickActionsTab(containerEl: HTMLElement) {
		displayQuickActionsTab(containerEl, this.plugin, this.app, () => this.display());
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
			new Notice(`✅ all ${successful} mcp servers connected successfully!`);
		} else {
			new Notice(`⚠️ ${successful} connected, ${failed} failed`);

			// Show detailed results in console
			console.debug('[MCP] Connection test results:');
			for (const result of results) {
				console.debug(`  ${result.success ? '✅' : '❌'} ${result.name}: ${result.error || 'connected'}`);
			}
		}

		void this.display();
	}

}

// MCP Inspector Modal
