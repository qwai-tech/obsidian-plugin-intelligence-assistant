import { McpSettingsPage } from '../../../pages/settings/mcp-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

const INSPECTOR = '.modal-container:not(:has(.mod-settings))';

describe('UX review: MCP inspector', () => {
	const mcp = new McpSettingsPage();
	const settings = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	after(async () => {
		await settings.closeSettings();
	});

	it('P2 the inspector shows no placeholder logs', async () => {
		await mcp.open();
		await probe.clickButton('Open MCP inspector');
		const tabs = await probe.buttonLabelsIn(`${INSPECTOR} .ia-tab-container, ${INSPECTOR}`);
		for (const tab of tabs.filter(label => label === 'Logs' || label === 'Test a tool')) {
			await probe.clickButton(tab, INSPECTOR);
		}

		expect(await probe.textIn(INSPECTOR)).not.toMatch(/placeholder/i);
		expect(await probe.textIn(INSPECTOR)).toMatch(/Test tool execution/);
	});
});
