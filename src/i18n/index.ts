import i18next from 'i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const i18n = i18next.createInstance();

export function initI18n(langOverride?: string): void {
	let lang: string;
	if (langOverride !== undefined) {
		lang = langOverride;
	} else {
		const raw: string = (window as Window & { moment?: { locale(): string } }).moment?.locale() ?? 'en';
		lang = raw.startsWith('zh') ? 'zh' : 'en';
	}

	void i18n.init({
		lng: lang,
		fallbackLng: 'en',
		initAsync: false,
		resources: {
			en: { translation: en as Record<string, unknown> },
			zh: { translation: zh as Record<string, unknown> },
		},
		interpolation: { escapeValue: false },
	});
}

export function t(key: string, options?: Record<string, unknown>): string {
	return i18n.t(key, options);
}
