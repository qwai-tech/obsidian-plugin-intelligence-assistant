import { LlmSettingsPage } from '../../pages/settings/llm-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface ProviderFile {
	providers: Array<{
		provider: string;
		baseUrl?: string;
		cacheTimestamp?: number;
		cachedModels?: Array<{ id: string; name: string; provider: string }>;
	}>;
}

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

	it('refreshes provider models into provider and model-cache persistence', async () => {
		await mockLLM.models(['gpt-4o-refresh-a', 'gpt-4o-refresh-b']);

		await settings.refreshProviderModels('openai');

		await browser.waitUntil(
			async () => {
				const providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
				const provider = providerFile.providers.find(candidate => candidate.provider === 'openai');
				return provider?.cachedModels?.some(model => model.id === 'openai:gpt-4o-refresh-a') ?? false;
			},
			{ timeout: 10_000, timeoutMsg: 'Provider model refresh was not persisted' }
		);

		const providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		const provider = providerFile.providers.find(candidate => candidate.provider === 'openai');
		await expect(provider).toEqual(expect.objectContaining({
			provider: 'openai',
			cacheTimestamp: expect.any(Number),
			cachedModels: expect.arrayContaining([
				expect.objectContaining({ id: 'openai:gpt-4o-refresh-a', name: 'gpt-4o-refresh-a', provider: 'openai' }),
				expect.objectContaining({ id: 'openai:gpt-4o-refresh-b', name: 'gpt-4o-refresh-b', provider: 'openai' }),
			]),
		}));

		const modelCache = await vault.readRuntimeDataFile<ModelCacheFile>('data/cache/llm_models.json');
		await expect(modelCache.entries).toEqual(expect.arrayContaining([
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
		await expect(calls).toEqual(expect.arrayContaining([
			expect.objectContaining({ method: 'GET', path: '/v1/models' }),
		]));
	});
});
