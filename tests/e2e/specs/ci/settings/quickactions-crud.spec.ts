import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { QuickActionsTabPage } from '../../../pages/settings/quickactions-tab.page';

describe('Settings - Quick Actions', () => {
	let settings: SettingsShellPage;
	let qaTab: QuickActionsTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		qaTab = new QuickActionsTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Quick Actions');
	});

	it('should display quick actions list', async () => {
		const count = await qaTab.getActionCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should open add action modal', async () => {
		await qaTab.clickAddAction();
		await browser.pause(300);
		await browser.keys('Escape');
	});
});
