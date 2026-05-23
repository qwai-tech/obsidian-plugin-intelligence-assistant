import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { MCPTabPage } from '../../../pages/settings/mcp-tab.page';

describe('MCP - Connection Status', () => {
	let settings: SettingsShellPage;
	let mcpTab: MCPTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		mcpTab = new MCPTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('MCP');
	});

	it('should display server list without crashing', async () => {
		const count = await mcpTab.getServerCount();
		expect(typeof count).toBe('number');
	});

	it('should not crash when refreshing tools', async () => {
		await mcpTab.clickRefreshAllTools();
		const count = await mcpTab.getServerCount();
		expect(typeof count).toBe('number');
	});
});
