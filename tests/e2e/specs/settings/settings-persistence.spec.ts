import { GeneralSettingsPage } from '../../pages/settings/general-settings.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture, type StoredSettings } from '../../support/vault-fixture';

const persisted = (settings: StoredSettings) =>
	settings.config.providers?.defaultModel === 'openai:gpt-4o-persisted' &&
	settings.config.conversations?.title?.mode === 'manual' &&
	settings.config.conversations?.icon?.enabled === false;

describe('Settings persistence', () => {
	const settings = new GeneralSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await settings.open();
	});

	it('keeps general settings in data.json across a plugin reload', async () => {
		await settings.setDefaultModel('openai:gpt-4o-persisted');
		await settings.setConversationTitleMode('manual');
		await settings.setConversationIconsEnabled(false);

		await vault.waitForSettings(persisted, 'data.json did not record the general settings');

		await reloadPlugin();
		await settings.open();

		expect(await settings.getDefaultModel()).toBe('openai:gpt-4o-persisted');
		expect(await settings.getConversationTitleMode()).toBe('manual');
		expect(await settings.getConversationIconsEnabled()).toBe(false);
		await vault.waitForSettings(persisted, 'data.json lost the general settings after reload');
	});
});
