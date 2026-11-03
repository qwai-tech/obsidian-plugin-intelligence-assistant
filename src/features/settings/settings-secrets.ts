import type { LLMConfig } from '@/features/llm';
import type { WebSearchConfig } from '@/features/web-search';
import type { PluginSettings } from '@/features/settings/types/settings';

export interface SecretVault {
	get(id: string): string | null;
	set(id: string, value: string): void;
	list(): string[];
}

type WebSearchKey = 'apiKey' | 'tavilyApiKey' | 'braveApiKey' | 'qwantApiKey' | 'mojeekApiKey';
type WebSearchSecret = `${WebSearchKey}Secret`;

const WEB_SEARCH_KEYS: Array<{ key: WebSearchKey; secret: WebSearchSecret; name: string }> = [
	{ key: 'apiKey', secret: 'apiKeySecret', name: 'web-search' },
	{ key: 'tavilyApiKey', secret: 'tavilyApiKeySecret', name: 'web-search-tavily' },
	{ key: 'braveApiKey', secret: 'braveApiKeySecret', name: 'web-search-brave' },
	{ key: 'qwantApiKey', secret: 'qwantApiKeySecret', name: 'web-search-qwant' },
	{ key: 'mojeekApiKey', secret: 'mojeekApiKeySecret', name: 'web-search-mojeek' },
];

const SECRET_PREFIX = 'intelligence-assistant';

export function moveKeysToVault(settings: PluginSettings, vault: SecretVault): boolean {
	const taken = new Set(vault.list());
	const store = (name: string, value: string): string => {
		const id = freeSecretId(`${SECRET_PREFIX}-${name}`, taken);
		vault.set(id, value);
		taken.add(id);
		return id;
	};
	let moved = false;
	for (const config of settings.llmConfigs) {
		if (config.apiKey && !config.apiKeySecret) {
			config.apiKeySecret = store(config.provider, config.apiKey);
			moved = true;
		}
	}
	const web = settings.webSearchConfig;
	for (const { key, secret, name } of WEB_SEARCH_KEYS) {
		const value = web[key];
		if (value && !web[secret]) {
			web[secret] = store(name, value);
			moved = true;
		}
	}
	for (const source of settings.openApiTools ?? []) {
		if (source.authValue && !source.authValueSecret) {
			source.authValueSecret = store(`http-${source.id}`, source.authValue);
			moved = true;
		}
	}
	return moved;
}

export function revealKeys(settings: PluginSettings, vault: SecretVault): void {
	for (const config of settings.llmConfigs) {
		if (config.apiKeySecret) {
			config.apiKey = vault.get(config.apiKeySecret) ?? undefined;
		}
	}
	const web = settings.webSearchConfig;
	for (const { key, secret } of WEB_SEARCH_KEYS) {
		const id = web[secret];
		web[key] = id ? vault.get(id) ?? undefined : undefined;
	}
	for (const source of settings.openApiTools ?? []) {
		if (source.authValueSecret) {
			source.authValue = vault.get(source.authValueSecret) ?? undefined;
		}
	}
}

export function withoutKeys(settings: PluginSettings): PluginSettings {
	return {
		...settings,
		llmConfigs: withoutProviderKeys(settings.llmConfigs),
		webSearchConfig: withoutWebSearchKeys(settings.webSearchConfig),
		openApiTools: (settings.openApiTools ?? []).map(({ authValue: _authValue, ...source }) => source),
	};
}

export function withoutProviderKeys(configs: LLMConfig[]): LLMConfig[] {
	return configs.map(({ apiKey: _apiKey, ...rest }) => rest);
}

function withoutWebSearchKeys(config: WebSearchConfig): WebSearchConfig {
	const stored = { ...config };
	for (const { key } of WEB_SEARCH_KEYS) {
		delete stored[key];
	}
	return stored;
}

function freeSecretId(base: string, taken: ReadonlySet<string>): string {
	const id = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/-$/, '');
	if (!taken.has(id)) {
		return id;
	}
	let suffix = 2;
	while (taken.has(`${id}-${suffix}`)) {
		suffix += 1;
	}
	return `${id}-${suffix}`;
}
