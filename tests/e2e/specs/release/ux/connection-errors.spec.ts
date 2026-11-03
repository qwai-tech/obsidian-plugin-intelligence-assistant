import { LlmSettingsPage } from '../../../pages/settings/llm-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { skipUnlessOllama } from '../../../support/ollama-env';
import { VaultFixture } from '../../../support/vault-fixture';

describe('UX review: connection test errors', () => {
	const llm = new LlmSettingsPage();
	const settings = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await vault.reset();
		await waitForPluginReady();
	});

	afterEach(async () => {
		await settings.closeSettings();
	});

	async function testConnection(baseUrl: string): Promise<string> {
		await llm.openProviderTab();
		await probe.clearNotices();
		await llm.openNewProviderForm({ provider: 'custom', baseUrl, apiKey: { secret: 'ux-connection-key', value: 'local' } });
		await llm.testConnectionInForm();
		const notice = await probe.waitForNotice(() => true, 30_000);
		await llm.cancelProviderForm();
		return notice;
	}

	it('P2 a wrong endpoint path and an unreachable host get different, specific messages', async () => {
		const notFound = await testConnection('http://localhost:11434/nope/v1');
		const unreachable = await testConnection('http://127.0.0.1:9/v1');

		expect(notFound).not.toBe(unreachable);
		expect(notFound).toMatch(/404|not found/i);
		expect(unreachable).toMatch(/reach|connect/i);
	});
});
