describe('i18n module', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('returns English string for en locale', () => {
		(global as unknown as Record<string, unknown>).window = {
			moment: { locale: () => 'en' }
		};
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: () => void; t: (k: string) => string };
		initI18n();
		expect(t('settings.tabs.general')).toBe('General');
	});

	it('returns Chinese string for zh-cn locale', () => {
		(global as unknown as Record<string, unknown>).window = {
			moment: { locale: () => 'zh-cn' }
		};
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: () => void; t: (k: string) => string };
		initI18n();
		expect(t('settings.tabs.general')).toBe('通用');
	});

	it('falls back to English for unknown locale', () => {
		(global as unknown as Record<string, unknown>).window = {
			moment: { locale: () => 'ja' }
		};
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: () => void; t: (k: string) => string };
		initI18n();
		expect(t('settings.tabs.mcp')).toBe('MCP');
	});
});
