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

	// Create sub-tab navigation
	const tabNavContainer = containerEl.createDiv('ia-llm-tab-nav');

	// Create content container for sub-tabs
	const tabContentContainer = containerEl.createDiv('ia-llm-tab-content');

	const subTabs: Array<{ id: LLMSubTab; label: string; icon: string }> = [
		{ id: 'provider', label: t('settings.llm.subTabs.provider'), icon: '🔌' },
		{ id: 'models', label: t('settings.llm.subTabs.models'), icon: '🤖' }
	];

	let activeTab: LLMSubTab = initialActiveTab;

	const renderActiveTab = () => {
		tabContentContainer.empty();

		switch (activeTab) {
			case 'provider':
				displayProviderTab(tabContentContainer, plugin, app, refreshDisplay);
				break;
			case 'models':
				displayModelsTab(tabContentContainer, plugin, modelFilters, onModelFilterChange, refreshDisplay);
				break;
		}
	};

	// Create tab buttons
	subTabs.forEach(tab => {
		const tabBtn = tabNavContainer.createEl('button', {
			text: `${tab.icon} ${tab.label}`,
			cls: 'ia-llm-subtab-btn'
		});
		tabBtn.setAttribute('data-testid', TestIds.settings.llmSubTab);
		tabBtn.setAttribute('data-subtab-id', tab.id);

		tabBtn.toggleClass('ia-llm-subtab-btn--active', activeTab === tab.id);
		tabBtn.addClass('ia-clickable');

		tabBtn.addEventListener('click', () => {
			activeTab = tab.id;
			onActiveTabChange?.(activeTab);
			// Update all buttons
			tabNavContainer.querySelectorAll('.ia-llm-subtab-btn').forEach((btn, index) => {
				const isActive = subTabs[index].id === activeTab;
				(btn as HTMLElement).toggleClass('ia-llm-subtab-btn--active', isActive);
			});
			renderActiveTab();
		});
	});

	// Initial render
	renderActiveTab();
}
