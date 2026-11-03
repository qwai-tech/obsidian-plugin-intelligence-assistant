/**
 * Web Search Settings Tab
 * Displays web search configuration settings
 */

import { Setting } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import { t } from '@/i18n';
import { SEARCH_PROVIDER_IDS, type WebSearchConfig } from '@/features/web-search';
import { SettingsForm } from '@/ui/settings/settings-form';

// Verbatim example values shown as input placeholders (locale codes, URLs and
// API-key prefixes). Declared as named constants so they render exactly as
// written instead of being normalized to sentence case.
const EXAMPLE_PLACEHOLDERS = {
	searchLanguage: 'en',
	googleEngineId: 'search-engine-id',
	serpApiUrl: 'https://serpapi.com/search',
	searxngUrl: 'https://searxng.example.com/search',
} as const;

const TIME_RANGES = ['any', 'h', 'd', 'w', 'm', 'y'] as const;

type SecretKey = 'apiKeySecret' | 'tavilyApiKeySecret' | 'braveApiKeySecret' | 'qwantApiKeySecret' | 'mojeekApiKeySecret';
type TextKey = 'googleCseId' | 'serpapiEndpoint' | 'searxngEndpoint';
type Credential =
	| { key: SecretKey; label: string; secret: true; placeholder?: undefined }
	| { key: TextKey; label: string; secret: false; placeholder: string };

const API_KEY: Credential = { key: 'apiKeySecret', label: 'apiKey', secret: true };

const CREDENTIALS: Record<string, Credential[]> = {
	google: [API_KEY, { key: 'googleCseId', label: 'googleCseId', secret: false, placeholder: EXAMPLE_PLACEHOLDERS.googleEngineId }],
	bing: [API_KEY],
	serpapi: [API_KEY, { key: 'serpapiEndpoint', label: 'serpapiEndpoint', secret: false, placeholder: EXAMPLE_PLACEHOLDERS.serpApiUrl }],
	tavily: [{ key: 'tavilyApiKeySecret', label: 'tavilyApiKey', secret: true }],
	searxng: [{ key: 'searxngEndpoint', label: 'searxngEndpoint', secret: false, placeholder: EXAMPLE_PLACEHOLDERS.searxngUrl }],
	brave: [{ key: 'braveApiKeySecret', label: 'braveApiKey', secret: true }],
	qwant: [{ key: 'qwantApiKeySecret', label: 'qwantApiKey', secret: true }],
	mojeek: [{ key: 'mojeekApiKeySecret', label: 'mojeekApiKey', secret: true }],
};

export function displayWebSearchTab(
	containerEl: HTMLElement,
	plugin: PluginHost
): void {
	containerEl.createEl('p', { text: t('settings.websearch.desc'), cls: ['ia-section-description', 'ia-section-description--spaced'] });

	const form = new SettingsForm<WebSearchConfig>(containerEl, () => plugin.settings.webSearchConfig, (change) => plugin.updateSettings(change), 'webSearchConfig');
	const field = (name: string) => ({
		label: t(`settings.websearch.${name}.name`),
		description: t(`settings.websearch.${name}.desc`),
	});
	const subheading = (text: string) => new Setting(containerEl).setName(text).setHeading();

	subheading(t('settings.websearch.generalBehavior'));
	form.toggle('enabled', field('enabled'));
	form.toggle('autoTrigger', field('autoTrigger'), { fallback: true });
	form.number('maxResults', field('maxResults'), { placeholder: '5', integer: true, min: 1 });
	form.dropdown('timeRange', field('timeRange'), Object.fromEntries(
		TIME_RANGES.map(range => [range, t(`settings.websearch.timeRange.${range}`)]),
	), { fallback: 'any' });

	subheading(t('settings.websearch.providerSelection'));
	const credentials = createDiv();
	const showCredentials = () => {
		credentials.empty();
		const credentialForm = new SettingsForm<WebSearchConfig>(credentials, () => plugin.settings.webSearchConfig, (change) => plugin.updateSettings(change), 'webSearchConfig');
		for (const credential of CREDENTIALS[plugin.settings.webSearchConfig.provider] ?? []) {
			if (credential.secret) {
				credentialForm.secret(credential.key, field(credential.label), plugin.app);
			} else {
				credentialForm.text(credential.key, field(credential.label), { placeholder: credential.placeholder ?? '', optional: true });
			}
		}
	};
	form.dropdown('provider', field('provider'), Object.fromEntries(
		SEARCH_PROVIDER_IDS.map(provider => [provider, t(`settings.websearch.providers.${provider}`)]),
	), { then: showCredentials });

	subheading(t('settings.websearch.localeFilters'));
	form.text('searchLanguage', field('searchLanguage'), { placeholder: EXAMPLE_PLACEHOLDERS.searchLanguage, optional: true });
	form.text('searchCountry', field('searchCountry'), { placeholder: 'US', optional: true });
	form.text('includeDomains', field('includeDomains'), { placeholder: 'example.com, docs.example.org', optional: true });
	form.text('excludeDomains', field('excludeDomains'), { placeholder: 'spam.example.com', optional: true });

	subheading(t('settings.websearch.apiCredentials'));
	containerEl.appendChild(credentials);
	showCredentials();
}
