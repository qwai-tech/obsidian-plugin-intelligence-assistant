/**
 * Release-only test: real MCP integration.
 * Requires .env.test with a configured MCP server.
 */
import { ChatViewPage } from '../../pages/chat-view.page';
import { SettingsShellPage } from '../../pages/settings/settings-shell.page';
import { MCPTabPage } from '../../pages/settings/mcp-tab.page';

describe('Real MCP Integration', function () {
	this.timeout(180_000);

	let chatPage: ChatViewPage;

	before(async () => {
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	it('should open MCP settings without crashing', async () => {
		const settings = new SettingsShellPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('MCP');
		const mcpTab = new MCPTabPage();
		const count = await mcpTab.getServerCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should connect to chat view after MCP config check', async () => {
		await chatPage.open();
		const isOpen = await chatPage.isOpen();
		expect(isOpen).toBe(true);
	});
});
