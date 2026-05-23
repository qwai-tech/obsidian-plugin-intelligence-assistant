import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { GeneralTabPage } from '../../../pages/settings/general-tab.page';

describe('Settings - General Tab', () => {
	let settings: SettingsShellPage;
	let generalTab: GeneralTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		generalTab = new GeneralTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('General');
		await browser.pause(300);
	});

	it('should display General settings tab', async () => {
		const mode = await generalTab.getDefaultMode();
		expect(typeof mode).toBe('string');
	});
});
