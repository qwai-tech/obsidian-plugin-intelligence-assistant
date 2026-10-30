import { PromptsSettingsPage } from '../../pages/settings/prompts-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture, type StoredSettings } from '../../support/vault-fixture';

const sentinel = (settings: StoredSettings) => settings.prompts.list.find(prompt => prompt.name === 'E2E System Prompt');

describe('System prompt settings', () => {
	const prompts = new PromptsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	it('creates, edits, disables, persists, and deletes a system prompt', async () => {
		await prompts.addPrompt({ name: 'E2E Draft Prompt', content: 'Draft content.' });
		await prompts.editPrompt('E2E Draft Prompt', {
			name: 'E2E System Prompt',
			content: 'You are the E2E system prompt sentinel.',
		});
		await prompts.togglePrompt('E2E System Prompt');

		const settings = await vault.waitForSettings(
			candidate => sentinel(candidate)?.enabled === false && sentinel(candidate)?.content === 'You are the E2E system prompt sentinel.',
			'The edited prompt was not persisted'
		);
		expect(sentinel(settings)).toEqual(expect.objectContaining({
			name: 'E2E System Prompt',
			content: 'You are the E2E system prompt sentinel.',
			enabled: false,
		}));

		await prompts.deletePrompt('E2E System Prompt');
		await vault.waitForSettings(candidate => sentinel(candidate) === undefined, 'The prompt was not removed');
	});
});
