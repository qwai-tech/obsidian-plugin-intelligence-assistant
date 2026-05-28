import { LlmSettingsPage } from '../../pages/settings/llm-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface ProviderFile {
	providers: Array<{
		provider: string;
		apiKey?: string;
		baseUrl?: string;
		modelFilter?: string;
	}>;
}

describe('LLM provider CRUD settings', () => {
	const settings = new LlmSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await settings.openProviderTab();
	});

	it('creates, updates, persists, and deletes a provider through the UI', async () => {
		await settings.addProvider({
			provider: 'custom',
			apiKey: 'sk-crud-create',
			baseUrl: 'http://127.0.0.1:43117/v1/custom',
			modelFilter: 'crud-create',
		});

		let providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		await expect(providerFile.providers).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: 'custom',
				apiKey: 'sk-crud-create',
				baseUrl: 'http://127.0.0.1:43117/v1/custom',
				modelFilter: 'crud-create',
			}),
		]));

		await settings.editProvider('custom', {
			apiKey: 'sk-crud-update',
			baseUrl: 'http://127.0.0.1:43117/v1/updated',
			modelFilter: 'crud-update',
		});

		providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		await expect(providerFile.providers).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: 'custom',
				apiKey: 'sk-crud-update',
				baseUrl: 'http://127.0.0.1:43117/v1/updated',
				modelFilter: 'crud-update',
			}),
		]));

		await settings.deleteProvider('custom');

		providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		await expect(providerFile.providers.find(provider => provider.provider === 'custom')).toBeUndefined();
	});
});
