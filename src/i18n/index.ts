import i18next from 'i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

export function initI18n(): void {
	const raw: string = (window as Window & { moment?: { locale(): string } }).moment?.locale() ?? 'en';
	const lang = raw.startsWith('zh') ? 'zh' : 'en';

	void i18next.init({
		lng: lang,
		fallbackLng: 'en',
		initImmediate: false,
		resources: {
			en: { translation: en as Record<string, unknown> },
			zh: { translation: zh as Record<string, unknown> },
		},
		interpolation: { escapeValue: false },
	});
}

export function t(key: string, options?: Record<string, unknown>): string {
	return i18next.t(key, options) as string;
}
