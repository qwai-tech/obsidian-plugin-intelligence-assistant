import { App, PluginSettingTab, type SettingDefinitionItem, type SettingDefinitionPage } from 'obsidian';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';
import type { PluginSettings } from '@/features/settings';
import { generalDefinitions } from './tabs/general-tab';
import { displayPromptsTab } from './tabs/prompts-tab';
import { displayToolsTab, type ToolsSubTab } from './tabs/tools-tab';
import { displayAgentsTab } from './tabs/agents-tab';
import { displayMCPTab, openAddMcpServer, testAllMcpConnections } from './tabs/mcp-tab';
import { displayLLMTab, type LLMSubTab } from './tabs/llm-tab';
import { displayRAGTab } from './tabs/rag-tab';
import { displayQuickActionsTab } from './tabs/quickactions-tab';
import { displayUsageTab } from './tabs/usage-tab';
import type { ModelFilters } from './tabs/models-tab';
import { SectionPage, type SectionRenderer } from './section-page';

export class IntelligenceAssistantSettingTab extends PluginSettingTab {
	private modelFilters: ModelFilters = { providerFilter: 'all', capabilityFilter: 'all', enabledFilter: 'all', searchTerm: '' };
	private llmSubTab: LLMSubTab = 'provider';
	private toolsSubTab: ToolsSubTab = 'built-in';

	constructor(app: App, private readonly plugin: IntelligenceAssistantPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...generalDefinitions(this.plugin),
			{
				type: 'group',
				items: [
					this.section('llm', (el, rerender) => {
						this.plugin.refreshSecretKeys();
						displayLLMTab(el, this.plugin, this.app, this.modelFilters,
							(filters) => { this.modelFilters = { ...this.modelFilters, ...filters }; }, rerender,
							this.llmSubTab, (tab) => { this.llmSubTab = tab; });
					}),
					this.section('mcp', (el, rerender) => displayMCPTab(el, this.plugin, this.app,
						async () => { await testAllMcpConnections(this.plugin); rerender(); }, rerender)),
					this.section('tools', (el, rerender) => displayToolsTab(el, this.plugin, this.toolsSubTab,
						(tab) => { this.toolsSubTab = tab; }, rerender, () => openAddMcpServer(this.app, this.plugin, rerender))),
					this.section('rag', (el) => displayRAGTab(el, this.plugin)),
					this.section('prompts', (el, rerender) => displayPromptsTab(el, this.plugin, this.app, rerender)),
					this.section('agents', (el, rerender) => displayAgentsTab(el, this.plugin, this.app, rerender)),
					this.section('quickActions', (el, rerender) => displayQuickActionsTab(el, this.plugin, this.app, rerender)),
					this.section('usage', (el, rerender) => { void displayUsageTab(el, this.plugin, this.app, rerender); }),
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await this.plugin.updateSettings((settings: PluginSettings) => {
			(settings as unknown as Record<string, unknown>)[key] = value;
		});
	}

	private section(id: string, render: SectionRenderer): SettingDefinitionPage {
		const name = t(`settings.tabs.${id}`);
		return { type: 'page', name, desc: t(`settings.${id}.desc`), page: () => new SectionPage(name, render) };
	}
}
