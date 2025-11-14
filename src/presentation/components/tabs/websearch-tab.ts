/**
 * Web Search Settings Tab
 * Displays web search configuration settings
 */

import { Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { applyConfigFieldMetadata, type ConfigFieldMetadataOptions } from '@/presentation/utils/config-field-metadata';

export function displayWebSearchTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: 'Web search configuration' });

	const desc = containerEl.createEl('p', {
		text: 'Configure web search functionality to enhance AI responses with up-to-date information from the internet.'
	});
	desc.setCssProps({ 'color': 'var(--text-muted)' });
	desc.setCssProps({ 'margin-bottom': '20px' });

	const config = plugin.settings.webSearchConfig;

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(containerEl), options);

	// Enable Web Search
	createSetting({
		path: 'webSearchConfig.enabled',
		label: 'Enable web search',
		description: 'Allow AI to search the web for current information'
	}).addToggle(toggle => toggle
			.setValue(config.enabled)
			.onChange(async (value) => {
				config.enabled = value;
				await plugin.saveSettings();
			}));

	// Search Provider
	createSetting({
		path: 'webSearchConfig.provider',
		label: 'Search provider',
		description: 'Web search engine to use'
	}).addDropdown(dropdown => dropdown
			.addOption('duckduckgo', 'DuckDuckGo')
			.addOption('google', 'Google')
			.addOption('bing', 'Bing')
			.setValue(config.provider)
			.onChange(async (value) => {
				config.provider = value;
				await plugin.saveSettings();
			}));

	// Auto-trigger search
	createSetting({
		path: 'webSearchConfig.autoTrigger',
		label: 'Auto-trigger search',
		description: 'Automatically trigger web search when the query requires current information (e.g., news, prices, recent events)'
	}).addToggle(toggle => toggle
			.setValue(config.autoTrigger ?? true)  // Default to true if not set
			.onChange(async (value) => {
				config.autoTrigger = value;
				await plugin.saveSettings();
			}));

	// Max Results
	createSetting({
		path: 'webSearchConfig.maxResults',
		label: 'Maximum results',
		description: 'Maximum number of search results to return'
	}).addText(text => text
			.setPlaceholder('5')
			.setValue(String(config.maxResults))
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					config.maxResults = num;
					await plugin.saveSettings();
				}
			}));
}
