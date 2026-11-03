import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

const DIALOG = '.modal-container:not(:has(.mod-settings))';

describe('UX review: CLI parameter inserted as an environment variable', () => {
	const tools = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	after(async () => {
		await tools.closeSettings();
	});

	it('P2 asks for the variable name as soon as "Environment variable" is chosen', async () => {
		await tools.open('cli');
		await probe.clickButton('Add CLI tool');
		await probe.clickButton('Add parameter', DIALOG);
		await probe.selectSettingOption('Insert as', 'env');

		expect(await probe.settingNamesIn(DIALOG)).toContain('Env variable name');
	});
});
