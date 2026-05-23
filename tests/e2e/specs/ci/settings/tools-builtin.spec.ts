import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { ToolsTabPage } from '../../../pages/settings/tools-tab.page';

describe('Tools - Built-in', () => {
	let settings: SettingsShellPage;
	let toolsTab: ToolsTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		toolsTab = new ToolsTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Tools');
	});

	it('should display all six built-in tools', async () => {
		const names = await toolsTab.getBuiltinToolNames();
		expect(names.length).toBeGreaterThanOrEqual(6);
	});

	it('should show familiar tool names', async () => {
		const names = await toolsTab.getBuiltinToolNames();
		const allNames = names.join(' ');
		expect(allNames).toMatch(/read/i);
		expect(allNames).toMatch(/write/i);
		expect(allNames).toMatch(/list/i);
	});

	it('should toggle a built-in tool without crashing', async () => {
		await toolsTab.toggleBuiltinTool(0);
		await browser.pause(200);
		// toggle back
		await toolsTab.toggleBuiltinTool(0);
	});
});
