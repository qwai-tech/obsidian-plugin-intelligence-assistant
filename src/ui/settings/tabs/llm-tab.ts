/**
 * LLM Settings Tab
 * Displays LLM provider and model configuration with sub-tabs
 */

import type { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n';
import { displayProviderTab } from './provider-tab';
import { displayModelsTab, type ModelFilters } from './models-tab';
import { TestIds } from '@/ui/utils/test-ids';
import { renderSubTabs } from '@/ui/settings/sub-tabs';

export type LLMSubTab = 'provider' | 'models';

export function displayLLMTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
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
				displayModelsTab(content, plugin, modelFilters, onModelFilterChange, refreshDisplay);
			}
		},
	});
}
