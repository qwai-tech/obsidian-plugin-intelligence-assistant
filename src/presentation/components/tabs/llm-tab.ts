/**
 * LLM Settings Tab
 * Displays LLM provider and model configuration with sub-tabs
 */

import type { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { displayProviderTab } from './provider-tab';
import { displayModelsTab, type ModelFilters } from './models-tab';

export function displayLLMTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	modelFilters: ModelFilters,
	onModelFilterChange: (filters: Partial<ModelFilters>) => void,
	refreshDisplay: () => void,
	initialActiveTab: 'provider' | 'models' = 'provider',
	onActiveTabChange?: (tab: 'provider' | 'models') => void
): void {
	containerEl.createEl('h3', { text: 'LLM configuration' });

	const desc = containerEl.createEl('p', {
		text: 'Configure language model providers and manage available models.'
	});
	desc.addClass('ia-section-description');

	// Create sub-tab navigation
	const tabNavContainer = containerEl.createDiv('ia-llm-tab-nav');

	// Create content container for sub-tabs
	const tabContentContainer = containerEl.createDiv('ia-llm-tab-content');

	const subTabs: Array<{ id: 'provider' | 'models'; label: string; icon: string }> = [
		{ id: 'provider', label: 'Providers', icon: '🔌' },
		{ id: 'models', label: 'Models', icon: '🤖' }
	];

	let activeTab: 'provider' | 'models' = initialActiveTab;

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
