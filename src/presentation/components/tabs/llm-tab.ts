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
	tabNavContainer.setCssProps({ 'gap': '8px' });
	tabNavContainer.setCssProps({ 'margin-bottom': '20px' });
	tabNavContainer.setCssProps({ 'border-bottom': '1px solid var(--background-modifier-border)' });
	tabNavContainer.setCssProps({ 'padding-bottom': '8px' });

	// Create content container for sub-tabs
	const tabContentContainer = containerEl.createDiv('ia-llm-tab-content');

	const subTabs = [
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

		tabBtn.setCssProps({ 'padding': '8px 16px' });
		tabBtn.setCssProps({ 'border': 'none' });
		tabBtn.setCssProps({ 'background': activeTab === tab.id ? 'var(--interactive-accent)' : 'transparent' });
		tabBtn.setCssProps({ 'color': activeTab === tab.id ? 'var(--text-on-accent)' : 'var(--text-normal)' });
		tabBtn.addClass('ia-clickable');
		tabBtn.setCssProps({ 'border-radius': '4px' });
		tabBtn.setCssProps({ 'cursor': 'pointer' });
		tabBtn.setCssProps({ 'transition': 'all 0.2s' });

		tabBtn.addEventListener('click', () => {
			activeTab = tab.id;
			onActiveTabChange?.(activeTab);
			// Update all buttons
			tabNavContainer.querySelectorAll('.ia-llm-subtab-btn').forEach((btn, index) => {
				const isActive = subTabs[index].id === activeTab;
				(btn as HTMLElement).setCssProps({
					'background': isActive ? 'var(--interactive-accent)' : 'transparent',
					'color': isActive ? 'var(--text-on-accent)' : 'var(--text-normal)'
				});
			});
			renderActiveTab();
		});

		// Hover effect
		tabBtn.addEventListener('mouseenter', () => {
			if (activeTab !== tab.id) {
				tabBtn.setCssProps({ 'background': 'var(--background-modifier-hover)' });
			}
		});
		tabBtn.addEventListener('mouseleave', () => {
			if (activeTab !== tab.id) {
				tabBtn.setCssProps({ 'background': 'transparent' });
			}
		});
	});

	// Initial render
	renderActiveTab();
}
