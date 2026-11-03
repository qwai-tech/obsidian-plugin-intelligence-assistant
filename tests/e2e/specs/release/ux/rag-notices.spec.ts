import { RagSettingsPage } from '../../../pages/settings/rag-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { enableOllamaRag, seedOllama, skipUnlessOllama } from '../../../support/ollama-env';
import { VaultFixture } from '../../../support/vault-fixture';

describe('UX review: indexing notices', function () {
	this.timeout(900_000);
	const rag = new RagSettingsPage();
	const settings = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await vault.reset();
		await waitForPluginReady();
		await seedOllama();
		await enableOllamaRag();
		await probe.createNotes('ux-index', 30);
	});

	after(async () => {
		await settings.closeSettings();
	});

	it('P2 rebuilding the index does not stack a pile of notices', async () => {
		await rag.open();
		await probe.clearNotices();
		const watch = probe.watchNoticeCount();
		await rag.rebuildIndex(600_000);
		await probe.capture('p2-index-notices');
		const most = await watch.stop();

		expect(most).toBeLessThanOrEqual(3);
	});
});
