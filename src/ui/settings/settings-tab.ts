import { App, PluginSettingTab, type Setting, type SettingDefinitionItem } from 'obsidian';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';
import { generalDefinitions } from './tabs/general-tab';
import { displayPromptsTab } from './tabs/prompts-tab';
import { displayToolsTab, type ToolsSubTab } from './tabs/tools-tab';
import { displayAgentsTab } from './tabs/agents-tab';
import { displayMCPTab } from './tabs/mcp-tab';
import { openAddMcpServer, testAllMcpConnections } from './tabs/mcp-actions';
import { displayLLMTab, type LLMSubTab } from './tabs/llm-tab';
import { displayRAGTab } from './tabs/rag-tab';
import { displayQuickActionsTab } from './tabs/quickactions-tab';
import { displayUsageTab } from './tabs/usage-tab';
import type { ModelFilters } from './tabs/models-tab';

const sections = ['general', 'llm', 'mcp', 'tools', 'rag', 'prompts', 'agents', 'quickActions', 'usage'] as const;
type Section = typeof sections[number];

export class IntelligenceAssistantSettingTab extends PluginSettingTab {
	private modelFilters: ModelFilters = { providerFilter: 'all', capabilityFilter: 'all', enabledFilter: 'all', searchTerm: '' };
	private llmSubTab: LLMSubTab = 'provider';
	private toolsSubTab: ToolsSubTab = 'built-in';
	private generalPanel?: HTMLElement;
	private revealGeneral?: (row: HTMLElement) => void;
	private refreshGeneralModels?: () => void;

	constructor(app: App, private readonly plugin: IntelligenceAssistantPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const general = generalDefinitions(this.plugin, refresh => { this.refreshGeneralModels = refresh; });
		const first = general[0];
		// Keep the host's searchable controls. Switching a top tab only hides
		// their DOM, never their search definitions.
		if (first && 'render' in first && first.render) {
			const render = first.render;
			first.render = (setting, group) => {
				this.generalPanel = group.listEl;
				group.listEl.id = 'ia-settings-general-panel';
				group.listEl.setAttribute('role', 'tabpanel');
				group.listEl.setAttribute('aria-labelledby', 'ia-settings-tab-general');
				const cleanup = render(setting, group);
				// The host reuses the current DOM when a search result is selected.
				// Reveal a hidden General target when the host highlights that row.
				const observer = new MutationObserver(records => {
					for (const record of records) {
						const row = record.target;
						if (group.listEl.hidden && row.instanceOf(HTMLElement) && row.hasClass('is-flashing')) {
							this.revealGeneral?.(row);
							break;
						}
					}
				});
				observer.observe(group.listEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
				return () => { observer.disconnect(); cleanup?.(); };
			};
		}
		return [
			{
				name: this.plugin.manifest.name,
				aliases: sections.map(id => t(`settings.tabs.${id}`)),
				render: setting => this.renderNavigation(setting),
			},
			{ type: 'group', cls: 'ia-settings-general-group', items: general },
		];
	}

	getControlValue(key: string): unknown {
		return Reflect.get(this.plugin.settings, key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await this.plugin.updateSettings((settings) => {
			Reflect.set(settings, key, value);
		});
	}

	private renderNavigation(setting: Setting): () => void {
		this.generalPanel = undefined;
		this.refreshGeneralModels = undefined;
		const shell = setting.settingEl;
		shell.empty();
		shell.addClass('ia-settings-tab-shell');
		const nav = shell.createDiv('settings-tabs ia-settings-main-tabs');
		nav.setAttribute('role', 'tablist');
		nav.setAttribute('aria-label', this.plugin.manifest.name);
		const panel = shell.createDiv('settings-tab-content ia-settings-main-panel');
		panel.id = 'ia-settings-section-panel';
		panel.setAttribute('role', 'tabpanel');
		let active: Section = 'general';
		const buttons = sections.map(id => {
			const button = nav.createEl('button', { text: t(`settings.tabs.${id}`), cls: 'settings-tab' });
			button.id = `ia-settings-tab-${id}`;
			button.dataset.settingsTab = id;
			button.setAttribute('role', 'tab');
			button.setAttribute('aria-controls', id === 'general' ? 'ia-settings-general-panel' : panel.id);
			button.addEventListener('click', () => select(id));
			button.addEventListener('keydown', event => {
				const index = sections.indexOf(id);
				const next = event.key === 'ArrowRight' ? (index + 1) % sections.length
					: event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length
						: event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
				if (next < 0) return;
				event.preventDefault();
				select(sections[next]);
				buttons[next].focus();
			});
			return button;
		});
		const render = () => {
			panel.empty();
			if (active !== 'general') this.renderSection(active, panel, render);
		};
		const select = (id: Section) => {
			active = id;
			buttons.forEach(button => {
				const selected = button.dataset.settingsTab === id;
				button.toggleClass('is-active', selected);
				button.setAttribute('aria-selected', String(selected));
				button.tabIndex = selected ? 0 : -1;
			});
			if (this.generalPanel) this.generalPanel.hidden = id !== 'general';
			if (id === 'general') this.refreshGeneralModels?.();
			panel.hidden = id === 'general';
			panel.setAttribute('aria-labelledby', `ia-settings-tab-${id}`);
			render();
		};
		select('general');
		this.revealGeneral = row => {
			select('general');
			row.scrollIntoView({ block: 'center' });
			row.focus({ preventScroll: true });
		};
		return () => { this.revealGeneral = undefined; this.refreshGeneralModels = undefined; };
	}

	private renderSection(id: Exclude<Section, 'general'>, el: HTMLElement, rerender: () => void): void {
		switch (id) {
			case 'llm':
				this.plugin.refreshSecretKeys();
				displayLLMTab(el, this.plugin, this.app, this.modelFilters,
					filters => { this.modelFilters = { ...this.modelFilters, ...filters }; }, rerender,
					this.llmSubTab, tab => { this.llmSubTab = tab; });
				break;
			case 'mcp':
				displayMCPTab(el, this.plugin, this.app,
					async () => { await testAllMcpConnections(this.plugin); rerender(); }, rerender);
				break;
			case 'tools':
				displayToolsTab(el, this.plugin, this.toolsSubTab,
					tab => { this.toolsSubTab = tab; }, rerender, () => openAddMcpServer(this.app, this.plugin, rerender));
				break;
			case 'rag': displayRAGTab(el, this.plugin); break;
			case 'prompts': displayPromptsTab(el, this.plugin, this.app, rerender); break;
			case 'agents': displayAgentsTab(el, this.plugin, this.app, rerender); break;
			case 'quickActions': displayQuickActionsTab(el, this.plugin, this.app, rerender); break;
			case 'usage': void displayUsageTab(el, this.plugin, this.app, rerender); break;
		}
	}
}
