import {App, Notice, PluginSettingTab} from 'obsidian';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';
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
import { TestIds } from '@/presentation/utils/test-ids';


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
	private ragSubTab: 'general' | 'vector' | 'grader' = 'general';
	private ragIndexModePill?: HTMLElement;
	private ragIndexModeMetric?: HTMLElement;

	constructor(app: App, plugin: IntelligenceAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		// Obsidian's imperative-render entry point. The declarative
		// getSettingDefinitions() API (1.13.0) is intentionally not used for this
		// multi-tab settings UI; delegate so internal re-renders don't call the
		// deprecated display() method directly.
		this.renderSettings();
	}

	private renderSettings(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.setAttribute('data-testid', TestIds.settings.shell);

		const tabNav = containerEl.createDiv('settings-tabs');
		const tabDefs: Array<{ slug: string; label: string }> = [
			{ slug: 'general', label: t('settings.tabs.general') },
			{ slug: 'llm', label: t('settings.tabs.llm') },
			{ slug: 'mcp', label: t('settings.tabs.mcp') },
			{ slug: 'tools', label: t('settings.tabs.tools') },
			{ slug: 'rag', label: t('settings.tabs.rag') },
			{ slug: 'prompts', label: t('settings.tabs.prompts') },
			{ slug: 'agents', label: t('settings.tabs.agents') },
			{ slug: 'quickactions', label: t('settings.tabs.quickActions') },
			{ slug: 'usage', label: t('settings.tabs.usage') }
		];

		const tabContent = containerEl.createDiv('settings-tab-content');

		tabDefs.forEach(def => {
			const btn = tabNav.createEl('button', { text: def.label });
			btn.className = 'settings-tab';
			btn.dataset.slug = def.slug;
			btn.setAttribute('data-testid', TestIds.settings.tab);
			btn.setAttribute('data-tab-id', def.slug);
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
			() => this.renderSettings(),
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
			() => this.renderSettings()
		);
	}

	private displayToolsTab(containerEl: HTMLElement) {
		displayToolsTab(
			containerEl,
			this.plugin,
			this.toolsSubTab,
			(tab) => { this.toolsSubTab = tab; },
			() => this.renderSettings(),
			() => {
				this.activeTab = 'mcp';
				this.renderSettings();
			}
		);
	}

	private displayPromptsTab(containerEl: HTMLElement) {
		displayPromptsTab(containerEl, this.plugin, this.app, () => this.renderSettings());
	}

	private displayRAGTab(containerEl: HTMLElement) {
		displayRAGTab(containerEl, this.plugin);
	}

	private displayAgentsTab(containerEl: HTMLElement) {
		displayAgentsTab(containerEl, this.plugin, this.app, () => this.renderSettings());
	}

	private displayUsageTab(containerEl: HTMLElement) {
		void displayUsageTab(containerEl, this.plugin, this.app, () => this.renderSettings());
	}

	private displayQuickActionsTab(containerEl: HTMLElement) {
		displayQuickActionsTab(containerEl, this.plugin, this.app, () => this.renderSettings());
	}

	private async testAllMCPConnections() {
		const mcpServers = this.plugin.settings.mcpServers;

		if (mcpServers.length === 0) {
			new Notice(t('settings.mcp.notices.noServersConfigured'));
			return;
		}

		new Notice(t('settings.mcp.notices.testingAll', { count: mcpServers.length }));

		const results: {name: string, success: boolean, error?: string}[] = [];
		let settingsDirty = false;

		for (const server of mcpServers) {
			if (!server.enabled) {
				results.push({ name: server.name, success: false, error: 'Server disabled' });
				continue;
			}

			try {
				// Probe via a throw-away McpToolSource so the cached shape stays
				// consistent with the registry-produced cache. Not registered with
				// the live registry — pure connection test.
				const { McpToolSource } = await import('@/application/tools/sources/mcp-tool-source');
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
			new Notice(t('settings.mcp.notices.testAllSuccess', { count: successful }));
		} else {
			new Notice(t('settings.mcp.notices.testAllPartial', { successful, failed }));

			// Show detailed results in console
			console.debug('[MCP] Connection test results:');
			for (const result of results) {
				console.debug(`  ${result.success ? '✅' : '❌'} ${result.name}: ${result.error || 'connected'}`);
			}
		}

		void this.renderSettings();
	}

}

// MCP Inspector Modal
