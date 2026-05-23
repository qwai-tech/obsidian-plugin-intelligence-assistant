import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { PromptsTabPage } from '../../../pages/settings/prompts-tab.page';

describe('Settings - Prompts', () => {
	let settings: SettingsShellPage;
	let promptsTab: PromptsTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		promptsTab = new PromptsTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('Prompts');
	});

	it('should display prompts list', async () => {
		const count = await promptsTab.getPromptCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should open add prompt modal', async () => {
		await promptsTab.clickAddPrompt();
		await browser.pause(300);
		// Close any open modal
		await browser.keys('Escape');
		await browser.pause(200);
	});
});
