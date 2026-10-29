/**
 * Web Search Settings Tab
 * Displays web search configuration settings
 */

import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n/index';
import type { WebSearchConfig } from '@/features/web-search/types/web-search';
import { SettingsForm } from '@/ui/settings/settings-form';

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

const TIME_RANGES = ['any', 'h', 'd', 'w', 'm', 'y'] as const;

const SEARCH_PROVIDERS = ['duckduckgo', 'google', 'bing', 'serpapi', 'tavily', 'searxng', 'brave', 'yahoo', 'yandex', 'qwant', 'mojeek'] as const;

export function displayWebSearchTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: t('settings.websearch.title') });
	containerEl.createEl('p', { text: t('settings.websearch.desc'), cls: ['ia-section-description', 'ia-section-description--spaced'] });

	const form = new SettingsForm<WebSearchConfig>(containerEl, () => plugin.settings.webSearchConfig, () => plugin.saveSettings(), 'webSearchConfig');
	const field = (name: string) => ({
		label: t(`settings.websearch.${name}.name`),
		description: t(`settings.websearch.${name}.desc`),
	});
	const subheading = (text: string) => containerEl.createEl('h4', { text, cls: 'ia-settings-subheading' });

	subheading(t('settings.websearch.generalBehavior'));
	form.toggle('enabled', field('enabled'));
	form.toggle('autoTrigger', field('autoTrigger'), { fallback: true });
	form.number('maxResults', field('maxResults'), { placeholder: '5', integer: true, min: 1 });
	form.dropdown('timeRange', field('timeRange'), Object.fromEntries(
		TIME_RANGES.map(range => [range, t(`settings.websearch.timeRange.${range}`)]),
	), { fallback: 'any' });

	subheading(t('settings.websearch.providerSelection'));
	form.dropdown('provider', field('provider'), Object.fromEntries(
		SEARCH_PROVIDERS.map(provider => [provider, t(`settings.websearch.providers.${provider}`)]),
	));

	subheading(t('settings.websearch.localeFilters'));
	form.text('searchLanguage', field('searchLanguage'), { placeholder: EXAMPLE_PLACEHOLDERS.searchLanguage, optional: true });
	form.text('searchCountry', field('searchCountry'), { placeholder: 'US', optional: true });
	form.text('includeDomains', field('includeDomains'), { placeholder: 'example.com, docs.example.org', optional: true });
	form.text('excludeDomains', field('excludeDomains'), { placeholder: 'spam.example.com', optional: true });

	subheading(t('settings.websearch.apiCredentials'));
	form.text('apiKey', field('apiKey'), { placeholder: EXAMPLE_PLACEHOLDERS.serpApiKey, optional: true });
	form.text('googleCseId', field('googleCseId'), { placeholder: EXAMPLE_PLACEHOLDERS.googleEngineId, optional: true });
	form.text('serpapiEndpoint', field('serpapiEndpoint'), { placeholder: EXAMPLE_PLACEHOLDERS.serpApiUrl, optional: true });
	form.text('tavilyApiKey', field('tavilyApiKey'), { placeholder: EXAMPLE_PLACEHOLDERS.tavilyKey, optional: true });
	form.text('searxngEndpoint', field('searxngEndpoint'), { placeholder: EXAMPLE_PLACEHOLDERS.searxngUrl, optional: true });
	form.text('braveApiKey', field('braveApiKey'), { placeholder: EXAMPLE_PLACEHOLDERS.braveKey, optional: true });
	form.text('qwantApiKey', field('qwantApiKey'), { placeholder: EXAMPLE_PLACEHOLDERS.qwantKey, optional: true });
	form.text('mojeekApiKey', field('mojeekApiKey'), { placeholder: EXAMPLE_PLACEHOLDERS.mojeekKey, optional: true });
}
