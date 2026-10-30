import { unpackLocale } from '@/adapters/i18n/packed-locales';

describe('i18n module', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('returns English string for en locale', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: (l?: string) => void; t: (k: string) => string };
		initI18n('en');
		expect(t('settings.tabs.general')).toBe('General');
	});

	it('returns Chinese string for zh locale', () => {
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as typeof import('@/i18n');
		initI18n('zh', unpackLocale);
		expect(t('settings.tabs.general')).toBe('通用');
	});

	it('loads any shipped language from the bundled packs', () => {
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as typeof import('@/i18n');
		initI18n('de-DE', unpackLocale);
		expect(t('chat.renameConversationPrompt')).toBe('Neuer Titel');
	});

	it('uses the right plural form for every count in languages with more than two', () => {
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as typeof import('@/i18n');
		initI18n('ru', unpackLocale);

		const words = [1, 3, 5].map(count => t('chat.proposals.changes', { count }).replace(/\d+/g, '').trim());

		expect(words.filter(text => text.includes('chat.proposals'))).toEqual([]);
		expect(new Set(words).size).toBe(3);
	});

	it('falls back to English for unknown locale', () => {
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as typeof import('@/i18n');
		initI18n('xx', unpackLocale);
		expect(t('settings.tabs.general')).toBe('General');
	});

	it('picks the singular or plural form from the count', () => {
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: (l?: string) => void; t: (k: string, o?: Record<string, unknown>) => string };
		initI18n('en');
		expect(t('settings.provider.count', { count: 1 })).toBe('1 provider configured');
		expect(t('settings.provider.count', { count: 3 })).toBe('3 providers configured');
	});

	it('uses only the plural suffixes i18next understands', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const fs = require('fs') as typeof import('fs');
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const path = require('path') as typeof import('path');
		const dir = path.join(__dirname, '../../i18n/locales');
		const offenders = fs.readdirSync(dir).filter(file => fs.readFileSync(path.join(dir, file), 'utf8').includes('_plural"'));
		expect(offenders).toEqual([]);
	});
});
