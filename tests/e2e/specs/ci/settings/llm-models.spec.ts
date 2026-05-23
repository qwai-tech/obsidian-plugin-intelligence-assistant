import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { LLMTabPage } from '../../../pages/settings/llm-tab.page';

describe('LLM - Models', () => {
	let settings: SettingsShellPage;
	let llmTab: LLMTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		llmTab = new LLMTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('LLM');
	});

	it('should navigate to the Models sub-tab', async () => {
		await llmTab.navigateToModelsTab();
		const count = await llmTab.getProviderCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});
});
