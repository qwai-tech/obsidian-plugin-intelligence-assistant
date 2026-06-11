/**
 * Web Search Settings Tab
 * Displays web search configuration settings
 */

import { Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n';
import { applyConfigFieldMetadata, type ConfigFieldMetadataOptions } from '@/presentation/utils/config-field-metadata';

// Verbatim example values shown as input placeholders (locale codes, URLs and
// API-key prefixes). Declared as named constants so they render exactly as
// written instead of being normalized to sentence case.
const EXAMPLE_PLACEHOLDERS = {
	searchLanguage: 'en',
	serpApiKey: 'sk-...',
	googleEngineId: 'search-engine-id',
	serpApiUrl: 'https://serpapi.com/search',
	tavilyKey: 'tvly-...',
	searxngUrl: 'https://searxng.example.com/search',
	braveKey: 'brv-...',
	qwantKey: 'qwant-...',
	mojeekKey: 'mjk-...',
} as const;

export function displayWebSearchTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: t('settings.websearch.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.websearch.desc')
	});
	desc.addClass('ia-section-description', 'ia-section-description--spaced');

	const config = plugin.settings.webSearchConfig;

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(containerEl), options);

	const providerOptions: Array<{ value: string; label: string }> = [
		{ value: 'duckduckgo', label: t('settings.websearch.providers.duckduckgo') },
		{ value: 'google', label: t('settings.websearch.providers.google') },
		{ value: 'bing', label: t('settings.websearch.providers.bing') },
		{ value: 'serpapi', label: t('settings.websearch.providers.serpapi') },
		{ value: 'tavily', label: t('settings.websearch.providers.tavily') },
		{ value: 'searxng', label: t('settings.websearch.providers.searxng') },
		{ value: 'brave', label: t('settings.websearch.providers.brave') },
		{ value: 'yahoo', label: t('settings.websearch.providers.yahoo') },
		{ value: 'yandex', label: t('settings.websearch.providers.yandex') },
		{ value: 'qwant', label: t('settings.websearch.providers.qwant') },
		{ value: 'mojeek', label: t('settings.websearch.providers.mojeek') }
	];

	const addSubheading = (text: string) => {
		const heading = containerEl.createEl('h4', { text });
		heading.addClass('ia-settings-subheading');
		return heading;
	};

	addSubheading(t('settings.websearch.generalBehavior'));

	createSetting({
		path: 'webSearchConfig.enabled',
		label: t('settings.websearch.enabled.name'),
		description: t('settings.websearch.enabled.desc')
	}).addToggle(toggle => toggle
			.setValue(config.enabled)
			.onChange((value) => {
				config.enabled = value;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.autoTrigger',
		label: t('settings.websearch.autoTrigger.name'),
		description: t('settings.websearch.autoTrigger.desc')
	}).addToggle(toggle => toggle
			.setValue(config.autoTrigger ?? true)
			.onChange((value) => {
				config.autoTrigger = value;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.maxResults',
		label: t('settings.websearch.maxResults.name'),
		description: t('settings.websearch.maxResults.desc')
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
		label: t('settings.websearch.timeRange.name'),
		description: t('settings.websearch.timeRange.desc')
	}).addDropdown(dropdown => {
		const timeRange = config.timeRange ?? 'any';
		const options: Array<[string, string]> = [
			['any', t('settings.websearch.timeRange.any')],
			['h', t('settings.websearch.timeRange.h')],
			['d', t('settings.websearch.timeRange.d')],
			['w', t('settings.websearch.timeRange.w')],
			['m', t('settings.websearch.timeRange.m')],
			['y', t('settings.websearch.timeRange.y')]
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

	addSubheading(t('settings.websearch.providerSelection'));

	createSetting({
		path: 'webSearchConfig.provider',
		label: t('settings.websearch.provider.name'),
		description: t('settings.websearch.provider.desc')
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

	addSubheading(t('settings.websearch.localeFilters'));

	createSetting({
		path: 'webSearchConfig.searchLanguage',
		label: t('settings.websearch.searchLanguage.name'),
		description: t('settings.websearch.searchLanguage.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.searchLanguage)
			.setValue(config.searchLanguage ?? '')
			.onChange((value) => {
				config.searchLanguage = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.searchCountry',
		label: t('settings.websearch.searchCountry.name'),
		description: t('settings.websearch.searchCountry.desc')
	}).addText(text => text
			.setPlaceholder('US')
			.setValue(config.searchCountry ?? '')
			.onChange((value) => {
				config.searchCountry = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.includeDomains',
		label: t('settings.websearch.includeDomains.name'),
		description: t('settings.websearch.includeDomains.desc')
	}).addText(text => text
			.setPlaceholder('example.com, docs.example.org')
			.setValue(config.includeDomains ?? '')
			.onChange((value) => {
				config.includeDomains = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.excludeDomains',
		label: t('settings.websearch.excludeDomains.name'),
		description: t('settings.websearch.excludeDomains.desc')
	}).addText(text => text
			.setPlaceholder('spam.example.com')
			.setValue(config.excludeDomains ?? '')
			.onChange((value) => {
				config.excludeDomains = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	addSubheading(t('settings.websearch.apiCredentials'));

	createSetting({
		path: 'webSearchConfig.apiKey',
		label: t('settings.websearch.apiKey.name'),
		description: t('settings.websearch.apiKey.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.serpApiKey)
			.setValue(config.apiKey ?? '')
			.onChange((value) => {
				config.apiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.googleCseId',
		label: t('settings.websearch.googleCseId.name'),
		description: t('settings.websearch.googleCseId.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.googleEngineId)
			.setValue(config.googleCseId ?? '')
			.onChange((value) => {
				config.googleCseId = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.serpapiEndpoint',
		label: t('settings.websearch.serpapiEndpoint.name'),
		description: t('settings.websearch.serpapiEndpoint.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.serpApiUrl)
			.setValue(config.serpapiEndpoint ?? '')
			.onChange((value) => {
				config.serpapiEndpoint = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.tavilyApiKey',
		label: t('settings.websearch.tavilyApiKey.name'),
		description: t('settings.websearch.tavilyApiKey.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.tavilyKey)
			.setValue(config.tavilyApiKey ?? '')
			.onChange((value) => {
				config.tavilyApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.searxngEndpoint',
		label: t('settings.websearch.searxngEndpoint.name'),
		description: t('settings.websearch.searxngEndpoint.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.searxngUrl)
			.setValue(config.searxngEndpoint ?? '')
			.onChange((value) => {
				config.searxngEndpoint = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.braveApiKey',
		label: t('settings.websearch.braveApiKey.name'),
		description: t('settings.websearch.braveApiKey.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.braveKey)
			.setValue(config.braveApiKey ?? '')
			.onChange((value) => {
				config.braveApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.qwantApiKey',
		label: t('settings.websearch.qwantApiKey.name'),
		description: t('settings.websearch.qwantApiKey.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.qwantKey)
			.setValue(config.qwantApiKey ?? '')
			.onChange((value) => {
				config.qwantApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));

	createSetting({
		path: 'webSearchConfig.mojeekApiKey',
		label: t('settings.websearch.mojeekApiKey.name'),
		description: t('settings.websearch.mojeekApiKey.desc')
	}).addText(text => text
			.setPlaceholder(EXAMPLE_PLACEHOLDERS.mojeekKey)
			.setValue(config.mojeekApiKey ?? '')
			.onChange((value) => {
				config.mojeekApiKey = value.trim() || undefined;
				void plugin.saveSettings();
			}));
}
