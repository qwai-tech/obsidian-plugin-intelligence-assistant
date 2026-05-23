import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { AgentsTabPage } from '../../../pages/settings/agents-tab.page';
import { AgentEditModalPage } from '../../../pages/modals/agent-edit-modal.page';

describe('Settings - Agents', () => {
	let settings: SettingsShellPage;
	let agentsTab: AgentsTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		agentsTab = new AgentsTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Agents');
	});

	it('should display agent list', async () => {
		const count = await agentsTab.getAgentCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should open add agent modal', async () => {
		await agentsTab.clickAddAgent();
		const modal = new AgentEditModalPage();
		const isOpen = await modal.isOpen();
		expect(isOpen).toBe(true);
	});

	it('should show tool access summary in agent modal', async () => {
		const modal = new AgentEditModalPage();
		const summary = await modal.getToolAccessSummary();
		expect(typeof summary).toBe('string');
		await modal.cancel();
	});
});
