import { reloadSettingsFromDisk, type SettingsReloadHost } from '@/application/services/settings-reload';

describe('onExternalSettingsChange reload sequence', () => {
	const makeHost = (overrides: Partial<SettingsReloadHost> = {}) => {
		const calls: string[] = [];
		const host: SettingsReloadHost = {
			loadSettings: jest.fn(async () => { calls.push('loadSettings'); }),
			invalidateDerivedState: jest.fn(() => { calls.push('invalidateDerivedState'); }),
			refreshChatViewsModels: jest.fn(async () => { calls.push('refreshChatViewsModels'); }),
			refreshStatusBar: jest.fn(() => { calls.push('refreshStatusBar'); }),
			...overrides,
		};
		return { host, calls };
	};

	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('re-reads settings from disk and refreshes derived state in order', async () => {
		const { host, calls } = makeHost();

		await reloadSettingsFromDisk(host);

		expect(host.loadSettings).toHaveBeenCalledTimes(1);
		expect(host.invalidateDerivedState).toHaveBeenCalledTimes(1);
		expect(host.refreshChatViewsModels).toHaveBeenCalledTimes(1);
		expect(host.refreshStatusBar).toHaveBeenCalledTimes(1);
		// loadSettings must run first; status bar repaint last.
		expect(calls[0]).toBe('loadSettings');
		expect(calls[calls.length - 1]).toBe('refreshStatusBar');
	});

	it('still re-reads settings and repaints the status bar when chat-view refresh fails', async () => {
		const { host } = makeHost({
			refreshChatViewsModels: jest.fn(async () => { throw new Error('no views'); }),
		});

		await expect(reloadSettingsFromDisk(host)).resolves.toBeUndefined();

		expect(host.loadSettings).toHaveBeenCalledTimes(1);
		expect(host.refreshStatusBar).toHaveBeenCalledTimes(1);
	});
});
