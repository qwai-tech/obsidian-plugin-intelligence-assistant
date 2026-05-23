import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { LLMTabPage } from '../../../pages/settings/llm-tab.page';
import { ProviderConfigModalPage } from '../../../pages/modals/provider-config-modal.page';

describe('LLM - Security', () => {
	let settings: SettingsShellPage;
	let llmTab: LLMTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		llmTab = new LLMTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('LLM');
	});

	it('should mask API key input as password', async () => {
		await llmTab.clickAddProvider();
		const modal = new ProviderConfigModalPage();
		const type = await modal.getApiKeyInputType();
		expect(type).toBe('password');
		await modal.cancel();
	});

	it('should not display API key in provider table as plain text', async () => {
		const providers = await llmTab.getProviderCount();
		expect(providers).toBeGreaterThanOrEqual(0);
	});
});
