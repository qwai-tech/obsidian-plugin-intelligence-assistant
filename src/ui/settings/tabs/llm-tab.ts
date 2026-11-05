/**
 * LLM Settings Tab
 * Displays LLM provider and model configuration with sub-tabs
 */

import type { App } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import { t } from '@/i18n';
import { displayProviderTab } from './provider-tab';
import { displayModelsTab, type ModelFilters } from './models-tab';
import { TestIds } from '@/ui/utils/test-ids';
import { renderSubTabs } from '@/ui/settings/sub-tabs';

export type LLMSubTab = 'provider' | 'models';

export function displayLLMTab(
	containerEl: HTMLElement,
	plugin: PluginHost,
	app: App,
	modelFilters: ModelFilters,
	onModelFilterChange: (filters: Partial<ModelFilters>) => void,
	refreshDisplay: () => void,
	initialActiveTab: LLMSubTab = 'provider',
	onActiveTabChange?: (tab: LLMSubTab) => void
): void {

	const desc = containerEl.createEl('p', {
		text: t('settings.llm.desc')
	});
	desc.addClass('ia-section-description');

	renderSubTabs<LLMSubTab>(containerEl, {
		tabs: [
			{ id: 'provider', label: t('settings.llm.subTabs.provider') },
			{ id: 'models', label: t('settings.llm.subTabs.models') },
		],
		active: initialActiveTab,
		testId: TestIds.settings.llmSubTab,
		onSelect: onActiveTabChange,
		render: (content, id) => {
			if (id === 'provider') {
				displayProviderTab(content, plugin, app, refreshDisplay);
			} else {
				const refreshModels = () => {
					const search = containerEl.querySelector<HTMLInputElement>('.ia-filter-search');
					const focused = search !== null && search === search.ownerDocument.activeElement;
					const from = search?.selectionStart ?? null;
					const to = search?.selectionEnd ?? null;
					refreshDisplay();
					if (focused) {
						const restored = containerEl.querySelector<HTMLInputElement>('.ia-filter-search');
						restored?.focus({ preventScroll: true });
						if (from !== null && to !== null) restored?.setSelectionRange(from, to);
					}
				};
				displayModelsTab(content, plugin, modelFilters, onModelFilterChange, refreshModels);
			}
		},
	});
}
