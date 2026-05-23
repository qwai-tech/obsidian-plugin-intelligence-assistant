import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { ToolsTabPage } from '../../../pages/settings/tools-tab.page';

describe('Tools - OpenAPI CRUD', () => {
	let settings: SettingsShellPage;
	let toolsTab: ToolsTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		toolsTab = new ToolsTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Tools');
	});

	it('should navigate to the OpenAPI sub-tab', async () => {
		await toolsTab.navigateToOpenApi();
		await browser.pause(300);
	});

	it('should display OpenAPI tool list', async () => {
		const names = await toolsTab.getBuiltinToolNames();
		expect(Array.isArray(names)).toBe(true);
	});
});
