import { LlmSettingsPage } from '../../pages/settings/llm-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

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

		let stored = await vault.waitForSettings(
			candidate => candidate.providers.some(provider => provider.apiKeySecret === 'crud-create'),
			'Created provider was not persisted'
		);
		expect(stored.providers).toEqual(expect.arrayContaining([
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

		stored = await vault.waitForSettings(
			candidate => candidate.providers.some(provider => provider.apiKeySecret === 'crud-update'),
			'Updated provider was not persisted'
		);
		expect(stored.providers).toEqual(expect.arrayContaining([
			expect.objectContaining({
				provider: 'custom',
				apiKeySecret: 'crud-update',
				baseUrl: 'http://127.0.0.1:43117/v1/updated',
				modelFilter: 'crud-update',
			}),
		]));

		expect(JSON.stringify(stored)).not.toContain('sk-crud');
		expect(await settings.readSecret('crud-update')).toBe('sk-crud-update');

		await settings.deleteProvider('custom');

		await vault.waitForSettings(
			candidate => !candidate.providers.some(provider => provider.provider === 'custom'),
			'Deleted provider is still persisted'
		);
	});
});
