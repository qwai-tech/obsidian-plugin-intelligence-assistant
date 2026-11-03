import { RagSettingsPage } from '../../../pages/settings/rag-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

const OTHER_PROVIDER_FIELDS = ['Google Custom Search Engine ID', 'SerpAPI endpoint', 'Tavily API key', 'Brave API key', 'Qwant API key (optional)', 'Mojeek API key'];

describe('UX review: web search provider fields', () => {
	const rag = new RagSettingsPage();
	const settings = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	after(async () => {
		await settings.closeSettings();
	});

	it('P2 shows only the selected provider\'s credential fields', async () => {
		await rag.open();
		await probe.clickButton('Web search');
		await probe.selectSettingOption('Search provider', 'searxng');
		const searxng = await probe.settingNamesIn('.vertical-tab-content');

		await probe.selectSettingOption('Search provider', 'brave');
		const brave = await probe.settingNamesIn('.vertical-tab-content');

		expect(searxng).toContain('SearXNG endpoint');
		expect(searxng.filter(name => OTHER_PROVIDER_FIELDS.includes(name))).toEqual([]);
		expect(brave).toContain('Brave API key');
		expect(brave).not.toContain('SearXNG endpoint');
	});
});
