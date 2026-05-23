import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { ToolsTabPage } from '../../../pages/settings/tools-tab.page';

describe('Tools - CLI CRUD', () => {
	let settings: SettingsShellPage;
	let toolsTab: ToolsTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		toolsTab = new ToolsTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Tools');
	});

	it('should navigate to the CLI sub-tab', async () => {
		await toolsTab.navigateToCli();
		await browser.pause(300);
	});

	it('should display CLI tool list or empty state', async () => {
		const names = await toolsTab.getBuiltinToolNames();
		expect(Array.isArray(names)).toBe(true);
	});
});
