import i18next from 'i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const i18n = i18next.createInstance();

// Locales that are bundled with the plugin (hand-curated)
const BUNDLED_LOCALES = new Set(['en', 'zh']);

// Map from Obsidian/moment locale codes → i18next language key
const LOCALE_MAP: Record<string, string> = {
	'af': 'af',
	'ar': 'ar',
	'be': 'be',
	'bg': 'bg',
	'bn': 'bn',
	'ca': 'ca',
	'cs': 'cs',
	'da': 'da',
	'de': 'de',
	'el': 'el',
	'en': 'en',
	'en-gb': 'en-GB',
	'en-GB': 'en-GB',
	'eo': 'eo',
	'es': 'es',
	'eu': 'eu',
	'fa': 'fa',
	'fi': 'fi',
	'fr': 'fr',
	'gl': 'gl',
	'he': 'he',
	'hr': 'hr',
	'hu': 'hu',
	'id': 'id',
	'it': 'it',
	'ja': 'ja',
	'ko': 'ko',
	'lt': 'lt',
	'lv': 'lv',
	'ml': 'ml',
	'ms': 'ms',
	'nl': 'nl',
	'nn': 'nn',
	'no': 'no',
	'pl': 'pl',
	'pt': 'pt',
	'pt-br': 'pt-BR',
	'pt-BR': 'pt-BR',
	'ro': 'ro',
	'ru': 'ru',
	'sk': 'sk',
	'sr': 'sr',
	'sv': 'sv',
	'ta': 'ta',
	'th': 'th',
	'tr': 'tr',
	'uk': 'uk',
	'ur': 'ur',
	'vi': 'vi',
	'zh': 'zh',
	'zh-cn': 'zh',
	'zh-CN': 'zh',
	'zh-hans': 'zh',
	'zh-Hans': 'zh',
	'zh-tw': 'zh-TW',
	'zh-TW': 'zh-TW',
	'zh-hant': 'zh-TW',
	'zh-Hant': 'zh-TW',
	'zh-hk': 'zh-TW',
	'zh-HK': 'zh-TW',
};

function resolveLocale(raw: string): string {
	if (raw in LOCALE_MAP) return LOCALE_MAP[raw];
	const prefix = raw.split('-')[0];
	if (prefix in LOCALE_MAP) return LOCALE_MAP[prefix];
	return 'en';
}

function loadLocaleFile(lang: string, pluginDir?: string): Record<string, unknown> | undefined {
	if (BUNDLED_LOCALES.has(lang) || !pluginDir) return undefined;
	let content: Record<string, unknown> | undefined;
	try {
		// Dynamic require with computed path — esbuild cannot bundle this
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime locale loading
		content = require(pluginDir + '/locales/' + lang + '.json') as Record<string, unknown>;
	} catch {
		// Fail silently — caller falls back to en
		content = undefined;
	}
	return content;
}

const BUNDLED: Record<string, Record<string, unknown>> = {
	en: { translation: en as Record<string, unknown> },
	zh: { translation: zh as Record<string, unknown> },
};

export function initI18n(langOverride?: string, pluginDir?: string): void {
	const raw: string = langOverride ??
		(window as Window & { moment?: { locale(): string } }).moment?.locale() ?? 'en';
	const lang = resolveLocale(raw);

	// Build resources: bundled en/zh always present; dynamic locale loaded from disk
	const resources: Record<string, Record<string, unknown>> = { ...BUNDLED };
	if (!BUNDLED_LOCALES.has(lang)) {
		const data = loadLocaleFile(lang, pluginDir);
		if (data) {
			resources[lang] = { translation: data };
		}
	}

	void i18n.init({
		lng: lang,
		fallbackLng: {
			'zh-TW': ['zh', 'en'],
			'pt-BR': ['pt', 'en'],
			'en-GB': ['en'],
			'default': ['en'],
		},
		initAsync: false,
		resources,
		interpolation: { escapeValue: false },
	});
}

export function t(key: string, options?: Record<string, unknown>): string {
	return i18n.t(key, options);
}
