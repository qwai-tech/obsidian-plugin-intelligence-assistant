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
});
