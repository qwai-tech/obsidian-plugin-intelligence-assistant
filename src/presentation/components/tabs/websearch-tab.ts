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

	const providerOptions: Array<{ value: string; label: string }> = [
		{ value: 'duckduckgo', label: 'DuckDuckGo (no key required)' },
		{ value: 'google', label: 'Google Custom Search' },
		{ value: 'bing', label: 'Bing Web Search' },
		{ value: 'serpapi', label: 'SerpAPI' },
		{ value: 'tavily', label: 'Tavily' },
		{ value: 'searxng', label: 'SearXNG' },
		{ value: 'brave', label: 'Brave Search' },
		{ value: 'yahoo', label: 'Yahoo (HTML scraping)' },
		{ value: 'yandex', label: 'Yandex (HTML scraping)' },
		{ value: 'qwant', label: 'Qwant' },
		{ value: 'mojeek', label: 'Mojeek' }
	];

	const addSubheading = (text: string) => {
		const heading = containerEl.createEl('h4', { text });
		heading.setCssProps({ 'margin-top': '1.5em' });
		heading.addClass('ia-settings-subheading');
		return heading;
	};

	addSubheading('General behavior');

	createSetting({
		path: 'webSearchConfig.enabled',
		label: 'Enable web search',
		description: 'Allow AI to search the web for current information'
	}).addToggle(toggle => toggle
			.setValue(config.enabled)
			.onChange((value) => {
				config.enabled = value;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.autoTrigger',
		label: 'Auto-trigger search',
		description: 'Automatically trigger web search when the query requires current information (e.g., news, prices, recent events)'
	}).addToggle(toggle => toggle
			.setValue(config.autoTrigger ?? true)
			.onChange((value) => {
				config.autoTrigger = value;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.maxResults',
		label: 'Maximum results',
		description: 'Maximum number of search results to return'
	}).addText(text => text
			.setPlaceholder('5')
			.setValue(String(config.maxResults))
			.onChange((value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num > 0) {
					config.maxResults = num;
					void plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'webSearchConfig.timeRange',
		label: 'Result freshness',
		description: 'Limit results to a time range supported by providers (Google, SearXNG, Mojeek)'
	}).addDropdown(dropdown => {
		const timeRange = config.timeRange ?? 'any';
		const options: Array<[string, string]> = [
			['any', 'Any time (default)'],
			['h', 'Past hour'],
			['d', 'Past 24 hours'],
			['w', 'Past week'],
			['m', 'Past month'],
			['y', 'Past year']
		];
		options.forEach(([value, label]) => {
			dropdown.addOption(value, label);
		});
		dropdown
			.setValue(timeRange)
			.onChange((value) => {
				config.timeRange = value;
				void plugin.saveSettings();
			});
	});

	addSubheading('Provider selection');

	createSetting({
		path: 'webSearchConfig.provider',
		label: 'Search provider',
		description: 'Choose from privacy-friendly scrapers or API-backed engines'
	}).addDropdown(dropdown => {
		providerOptions.forEach(option => {
			dropdown.addOption(option.value, option.label);
		});
		dropdown
			.setValue(config.provider)
			.onChange((value) => {
				config.provider = value;
				void plugin.saveSettings();
			});
	});

	addSubheading('Locale & filters');

	createSetting({
		path: 'webSearchConfig.searchLanguage',
		label: 'Language code',
		description: 'ISO language code (e.g., en, fr, zh-CN) forwarded to providers that support localization'
	}).addText(text => text
			.setPlaceholder('en')
			.setValue(config.searchLanguage ?? '')
			.onChange((value) => {
				config.searchLanguage = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.searchCountry',
		label: 'Country/market code',
		description: 'Two-letter country code (e.g., US, DE) used by Bing, DuckDuckGo, Brave, and others'
	}).addText(text => text
			.setPlaceholder('US')
			.setValue(config.searchCountry ?? '')
			.onChange((value) => {
				config.searchCountry = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.includeDomains',
		label: 'Include only these domains',
		description: 'Comma-separated list used by SerpAPI and Brave to limit results to specific sites'
	}).addText(text => text
			.setPlaceholder('example.com, docs.example.org')
			.setValue(config.includeDomains ?? '')
			.onChange((value) => {
				config.includeDomains = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.excludeDomains',
		label: 'Exclude domains',
		description: 'Comma-separated domains to filter out after fetching results'
	}).addText(text => text
			.setPlaceholder('spam.example.com')
			.setValue(config.excludeDomains ?? '')
			.onChange((value) => {
				config.excludeDomains = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	addSubheading('API credentials & endpoints');

	createSetting({
		path: 'webSearchConfig.apiKey',
		label: 'Default API key',
		description: 'Shared API key used by Google, Bing, SerpAPI, Tavily, or Brave when provider-specific keys are not set'
	}).addText(text => text
			.setPlaceholder('sk-...')
			.setValue(config.apiKey ?? '')
			.onChange((value) => {
				config.apiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.googleCseId',
		label: 'Google Custom Search Engine ID',
		description: 'Required with a Google API key when using the Google provider'
	}).addText(text => text
			.setPlaceholder('search-engine-id')
			.setValue(config.googleCseId ?? '')
			.onChange((value) => {
				config.googleCseId = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.serpapiEndpoint',
		label: 'SerpAPI endpoint',
		description: 'Override the SerpAPI base URL if you are self-hosting'
	}).addText(text => text
			.setPlaceholder('https://serpapi.com/search')
			.setValue(config.serpapiEndpoint ?? '')
			.onChange((value) => {
				config.serpapiEndpoint = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.tavilyApiKey',
		label: 'Tavily API key',
		description: 'Overrides the default key when using the Tavily provider'
	}).addText(text => text
			.setPlaceholder('tvly-...')
			.setValue(config.tavilyApiKey ?? '')
			.onChange((value) => {
				config.tavilyApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.searxngEndpoint',
		label: 'SearXNG endpoint',
		description: 'Base URL of your SearXNG instance (must return JSON)'
	}).addText(text => text
			.setPlaceholder('https://searxng.example.com/search')
			.setValue(config.searxngEndpoint ?? '')
			.onChange((value) => {
				config.searxngEndpoint = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.braveApiKey',
		label: 'Brave API key',
		description: 'Use a Brave Search API subscription token when selected as the provider'
	}).addText(text => text
			.setPlaceholder('brv-...')
			.setValue(config.braveApiKey ?? '')
			.onChange((value) => {
				config.braveApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.qwantApiKey',
		label: 'Qwant API key (optional)',
		description: 'Add a bearer token if your Qwant plan issues one'
	}).addText(text => text
			.setPlaceholder('qwant-...')
			.setValue(config.qwantApiKey ?? '')
			.onChange((value) => {
				config.qwantApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.mojeekApiKey',
		label: 'Mojeek API key',
		description: 'Required for the Mojeek provider'
	}).addText(text => text
			.setPlaceholder('mjk-...')
			.setValue(config.mojeekApiKey ?? '')
			.onChange((value) => {
				config.mojeekApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));
}
