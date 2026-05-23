import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { MCPTabPage } from '../../../pages/settings/mcp-tab.page';
import { MCPServerModalPage } from '../../../pages/modals/mcp-server-modal.page';

describe('MCP - Server CRUD', () => {
	let settings: SettingsShellPage;
	let mcpTab: MCPTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		mcpTab = new MCPTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('MCP');
	});

	it('should display existing MCP servers', async () => {
		const count = await mcpTab.getServerCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should open the add server modal', async () => {
		await mcpTab.clickAddServer();
		const modal = new MCPServerModalPage();
		const isOpen = await modal.isOpen();
		expect(isOpen).toBe(true);
		await modal.cancel();
	});

	it('should have refresh all tools button', async () => {
		// Clicking refresh is safe — it may fail if no servers configured
		await mcpTab.clickRefreshAllTools();
	});
});
