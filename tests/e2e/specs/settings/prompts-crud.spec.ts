import { PromptsSettingsPage } from '../../pages/settings/prompts-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface PromptIndexFile {
	prompts: Array<{
		id: string;
		name: string;
		enabled: boolean;
		file: string;
	}>;
}

interface PromptFile {
	id: string;
	name: string;
	content: string;
	enabled: boolean;
}

function toPluginRelativePath(file: string): string {
	const pluginPrefix = '.obsidian/plugins/intelligence-assistant/';
	return file.startsWith(pluginPrefix) ? file.slice(pluginPrefix.length) : file;
}

describe('System prompt settings', () => {
	const prompts = new PromptsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	it('creates, edits, disables, persists, and deletes a system prompt', async () => {
		await prompts.addPrompt();
		await prompts.editPrompt('New Prompt', {
			name: 'E2E System Prompt',
			content: 'You are the E2E system prompt sentinel.',
		});
		await prompts.togglePrompt('E2E System Prompt');

		let index = await vault.readRuntimeDataFile<PromptIndexFile>('data/prompts/index.json');
		let entry = index.prompts.find(prompt => prompt.name === 'E2E System Prompt');
		await expect(entry).toEqual(expect.objectContaining({ enabled: false }));

		const promptPath = toPluginRelativePath(entry!.file);
		await browser.waitUntil(
			async () => vault.runtimeDataFileExists(promptPath),
			{ timeout: 5_000, timeoutMsg: `Prompt file not written: ${promptPath}` }
		);
		const promptFile = await vault.readRuntimeDataFile<PromptFile>(promptPath);
		await expect(promptFile).toEqual(expect.objectContaining({
			id: entry!.id,
			name: 'E2E System Prompt',
			content: 'You are the E2E system prompt sentinel.',
			enabled: false,
		}));

		await prompts.deletePrompt('E2E System Prompt');

		index = await vault.readRuntimeDataFile<PromptIndexFile>('data/prompts/index.json');
		entry = index.prompts.find(prompt => prompt.name === 'E2E System Prompt');
		await expect(entry).toBeUndefined();
	});
});
