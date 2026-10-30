import { LlmSettingsPage } from '../../pages/settings/llm-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface ProviderFile {
	providers: Array<{
		provider: string;
		apiKey?: string;
		apiKeySecret?: string;
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
			apiKey: { secret: 'crud-create', value: 'sk-crud-create' },
			baseUrl: 'http://127.0.0.1:43117/v1/custom',
			modelFilter: 'crud-create',
		});

		let providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		expect(providerFile.providers).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: 'custom',
				apiKeySecret: 'crud-create',
				baseUrl: 'http://127.0.0.1:43117/v1/custom',
				modelFilter: 'crud-create',
			}),
		]));

		await settings.editProvider('custom', {
			apiKey: { secret: 'crud-update', value: 'sk-crud-update' },
			baseUrl: 'http://127.0.0.1:43117/v1/updated',
			modelFilter: 'crud-update',
		});

		providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		expect(providerFile.providers).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: 'custom',
				apiKeySecret: 'crud-update',
				baseUrl: 'http://127.0.0.1:43117/v1/updated',
				modelFilter: 'crud-update',
			}),
		]));

		expect(JSON.stringify(providerFile)).not.toContain('sk-crud');
		expect(await settings.readSecret('crud-update')).toBe('sk-crud-update');

		await settings.deleteProvider('custom');

		providerFile = await vault.readRuntimeDataFile<ProviderFile>('data/llm-providers.json');
		expect(providerFile.providers.find(provider => provider.provider === 'custom')).toBeUndefined();
	});
});
