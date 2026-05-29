import { GeneralSettingsPage } from '../../pages/settings/general-settings.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface UserSettingsFile {
	providers?: {
		defaultModel?: string;
	};
	conversations?: {
		title?: { mode?: string };
		icon?: { enabled?: boolean };
	};
}

async function waitForUserSettings(
	vault: VaultFixture,
	matches: (settings: UserSettingsFile) => boolean
): Promise<UserSettingsFile> {
	let lastSettings: UserSettingsFile | null = null;
	await browser.waitUntil(
		async () => {
			lastSettings = await vault.readRuntimeDataFile<UserSettingsFile>('config/user/settings.json');
			return matches(lastSettings);
		},
		{
			timeout: 10_000,
			timeoutMsg: 'settings.json did not reach expected state',
		}
	);
	if (!lastSettings) {
		throw new Error('settings.json was not read');
	}
	return lastSettings;
}

describe('Settings persistence', () => {
	const settings = new GeneralSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await settings.open();
	});

	it('keeps general settings after plugin reload', async () => {
		await settings.setDefaultModel('openai:gpt-4o-persisted');
		await settings.setConversationTitleMode('manual');
		await settings.setConversationIconsEnabled(false);

		let userSettings = await waitForUserSettings(vault, candidate =>
			candidate.providers?.defaultModel === 'openai:gpt-4o-persisted' &&
			candidate.conversations?.title?.mode === 'manual' &&
			candidate.conversations?.icon?.enabled === false
		);
		await expect(userSettings.providers?.defaultModel).toBe('openai:gpt-4o-persisted');
		await expect(userSettings.conversations?.title?.mode).toBe('manual');
		await expect(userSettings.conversations?.icon?.enabled).toBe(false);

		await reloadPlugin();
		await settings.open();

		await expect(await settings.getDefaultModel()).toBe('openai:gpt-4o-persisted');
		await expect(await settings.getConversationTitleMode()).toBe('manual');
		await expect(await settings.getConversationIconsEnabled()).toBe(false);

		userSettings = await waitForUserSettings(vault, candidate =>
			candidate.providers?.defaultModel === 'openai:gpt-4o-persisted' &&
			candidate.conversations?.title?.mode === 'manual' &&
			candidate.conversations?.icon?.enabled === false
		);
		await expect(userSettings.providers?.defaultModel).toBe('openai:gpt-4o-persisted');
		await expect(userSettings.conversations?.title?.mode).toBe('manual');
		await expect(userSettings.conversations?.icon?.enabled).toBe(false);
	});
});
