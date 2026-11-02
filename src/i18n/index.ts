import i18next, { type Resource, type ResourceLanguage } from 'i18next';
import en from './locales/en.json';

const i18n = i18next.createInstance();

export type LocaleLoader = (lang: string, keys: readonly string[]) => Record<string, unknown> | undefined;

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
	'nb': 'no',
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

let keys: string[] | null = null;

export function localeKeys(): readonly string[] {
	keys ??= flattenKeys(en);
	return keys;
}

function flattenKeys(tree: Record<string, unknown>, prefix = ''): string[] {
	return Object.entries(tree).flatMap(([key, value]) =>
		value !== null && typeof value === 'object' ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]);
}

export function initI18n(langOverride?: string, loadLocale?: LocaleLoader): void {
	const raw: string = langOverride ??
		(window as Window & { moment?: { locale(): string } }).moment?.locale() ?? 'en';
	const lang = resolveLocale(raw);

	const resources: Resource = { en: { translation: en as ResourceLanguage['translation'] } };
	const translation = lang === 'en' ? undefined : loadLocale?.(lang, localeKeys());
	if (translation) {
		resources[lang] = { translation: translation as ResourceLanguage['translation'] };
	}

	void i18n.init({
		lng: lang,
		fallbackLng: 'en',
		initAsync: false,
		resources,
		interpolation: { escapeValue: false },
	});
}

export function t(key: string, options?: Record<string, unknown>): string {
	return i18n.t(key, options);
}
