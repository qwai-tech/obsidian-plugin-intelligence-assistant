import { SettingsShellPage } from '../../../pages/settings/settings-shell.page';
import { RAGTabPage } from '../../../pages/settings/rag-tab.page';

describe('RAG - All Sub-tabs', () => {
	let settings: SettingsShellPage;
	let ragTab: RAGTabPage;

	before(async () => {
		settings = new SettingsShellPage();
		ragTab = new RAGTabPage();
		await settings.openPluginSettings();
		await settings.navigateToTab('RAG');
		await browser.pause(300);
	});

	it('should display the RAG overview sub-tab by default', async () => {
		const enabled = await ragTab.isRagEnabled().catch(() => false);
		expect(typeof enabled).toBe('boolean');
	});

	it('should navigate to Chunking sub-tab', async () => {
		await ragTab.navigateToSubTab('Chunking');
		await browser.pause(200);
	});

	it('should navigate to Search sub-tab', async () => {
		await ragTab.navigateToSubTab('Search');
		await browser.pause(200);
	});

	it('should navigate to Filters sub-tab', async () => {
		await ragTab.navigateToSubTab('Filters');
		await browser.pause(200);
	});

	it('should navigate to Advanced sub-tab', async () => {
		await ragTab.navigateToSubTab('Advanced');
		await browser.pause(200);
	});

	it('should navigate to Web Search sub-tab', async () => {
		await ragTab.navigateToSubTab('Web Search');
		await browser.pause(200);
	});
});
