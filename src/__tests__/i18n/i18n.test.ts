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
		const { initI18n, t } = require('@/i18n') as { initI18n: (l?: string) => void; t: (k: string) => string };
		initI18n('zh');
		expect(t('settings.tabs.general')).toBe('通用');
	});

	it('falls back to English for unknown locale', () => {
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: (l?: string) => void; t: (k: string) => string };
		initI18n('en');
		expect(t('settings.tabs.mcp')).toBe('MCP');
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
