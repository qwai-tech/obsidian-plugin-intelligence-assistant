import { LlmSettingsPage } from '../../pages/settings/llm-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface ModelCacheFile {
	entries: Array<{
		provider: string;
		baseUrl?: string;
		cacheTimestamp?: number;
		cachedModels: Array<{ id: string; name: string; provider: string }>;
	}>;
}

describe('LLM model refresh settings', () => {
	const settings = new LlmSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await settings.openProviderTab();
	});

	it('refreshes provider models into the model cache, not data.json', async () => {
		await mockLLM.models(['gpt-4o-refresh-a', 'gpt-4o-refresh-b']);

		await settings.refreshProviderModels('openai');

		await browser.waitUntil(
			async () => {
				if (!(await vault.runtimeDataFileExists('data/cache/llm_models.json'))) return false;
				const cache = await vault.readRuntimeDataFile<ModelCacheFile>('data/cache/llm_models.json');
				return cache.entries.some(entry => entry.cachedModels.some(model => model.id === 'openai:gpt-4o-refresh-a'));
			},
			{ timeout: 10_000, timeoutMsg: 'Provider model refresh was not persisted to the model cache' }
		);

		const stored = await vault.waitForSettings(() => true, 'data.json missing');
		expect(JSON.stringify(stored.providers)).not.toContain('cachedModels');

		const modelCache = await vault.readRuntimeDataFile<ModelCacheFile>('data/cache/llm_models.json');
		expect(modelCache.entries).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: 'openai',
				baseUrl: 'http://127.0.0.1:43117/v1',
				cacheTimestamp: expect.any(Number),
				cachedModels: expect.arrayContaining([
					expect.objectContaining({ id: 'openai:gpt-4o-refresh-a' }),
					expect.objectContaining({ id: 'openai:gpt-4o-refresh-b' }),
				]),
			}),
		]));

		const calls = await mockLLM.getCalls();
		expect(calls).toEqual(expect.arrayContaining([
			expect.objectContaining({ method: 'GET', path: '/v1/models' }),
		]));
	});
});
