import { AgentsSettingsPage } from '../../../pages/settings/agents-settings.page';
import { QuickActionsSettingsPage } from '../../../pages/settings/quick-actions-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

const DIALOG = '.modal-container:not(:has(.mod-settings))';

describe('UX review: adding agents and quick actions', () => {
	const agents = new AgentsSettingsPage();
	const quickActions = new QuickActionsSettingsPage();
	const settings = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	afterEach(async () => {
		await settings.closeSettings();
	});

	it('P2 cancelling Add agent leaves no placeholder agent behind', async () => {
		await agents.open();
		const before = await probe.storedCount('agents');
		await probe.clickButton('Add agent');
		await probe.clickButton('Cancel', DIALOG);

		expect(await probe.storedCount('agents')).toBe(before);
	});

	it('P2 cancelling Add quick action leaves no placeholder action behind', async () => {
		await quickActions.open();
		const before = await probe.storedCount('quickActions');
		await probe.clickButton('Add quick action');
		await probe.clickButton('Cancel', DIALOG);

		expect(await probe.storedCount('quickActions')).toBe(before);
	});

	it('P2 cancelling a quick action edit keeps its name', async () => {
		await quickActions.open();
		const [first] = await probe.storedNames('quickActions');
		await probe.clickButton('Edit', `[data-testid="ia-quick-action-row"][data-action-name="${first}"]`);
		await probe.typeIntoSetting('Name', 'Renamed then cancelled', DIALOG);
		await probe.clickButton('Cancel', DIALOG);

		expect((await probe.storedNames('quickActions'))[0]).toBe(first);
	});
});
