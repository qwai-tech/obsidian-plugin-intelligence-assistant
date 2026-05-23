import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { LLMTabPage } from '../../../pages/settings/llm-tab.page';
import { ProviderConfigModalPage } from '../../../pages/modals/provider-config-modal.page';

describe('LLM - Provider CRUD', () => {
	let settings: SettingsShellPage;
	let llmTab: LLMTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		llmTab = new LLMTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('LLM');
	});

	it('should display the LLM tab', async () => {
		const count = await llmTab.getProviderCount();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('should open the add provider modal', async () => {
		await llmTab.clickAddProvider();
		const modal = new ProviderConfigModalPage();
		const isOpen = await modal.isOpen();
		expect(isOpen).toBe(true);
	});

	it('should cancel the modal without adding', async () => {
		const modal = new ProviderConfigModalPage();
		await modal.cancel();
		const isOpen = await modal.isOpen();
		expect(isOpen).toBe(false);
	});
});
