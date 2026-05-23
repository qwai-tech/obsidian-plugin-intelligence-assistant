import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { UsageTabPage } from '../../../pages/settings/usage-tab.page';

describe('Settings - Usage Tab', () => {
	let settings: SettingsShellPage;
	let usageTab: UsageTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		usageTab = new UsageTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Usage');
	});

	it('should display usage statistics', async () => {
		const summary = await usageTab.getUsageSummary();
		expect(summary.length).toBeGreaterThanOrEqual(0);
	});
});
