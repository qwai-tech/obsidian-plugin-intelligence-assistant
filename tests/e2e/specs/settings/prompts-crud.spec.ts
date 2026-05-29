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

async function waitForPromptIndex(
	vault: VaultFixture,
	matches: (index: PromptIndexFile) => boolean
): Promise<PromptIndexFile> {
	let lastIndex: PromptIndexFile | null = null;
	await browser.waitUntil(
		async () => {
			lastIndex = await vault.readRuntimeDataFile<PromptIndexFile>('data/prompts/index.json');
			return matches(lastIndex);
		},
		{ timeout: 10_000, timeoutMsg: 'Prompt index did not reach expected state' }
	);
	if (!lastIndex) {
		throw new Error('Prompt index was not read');
	}
	return lastIndex;
}

async function waitForPromptFile(
	vault: VaultFixture,
	relativePath: string,
	matches: (prompt: PromptFile) => boolean
): Promise<PromptFile> {
	let lastPrompt: PromptFile | null = null;
	await browser.waitUntil(
		async () => {
			if (!(await vault.runtimeDataFileExists(relativePath))) {
				return false;
			}
			lastPrompt = await vault.readRuntimeDataFile<PromptFile>(relativePath);
			return matches(lastPrompt);
		},
		{ timeout: 10_000, timeoutMsg: `Prompt file did not reach expected state: ${relativePath}` }
	);
	if (!lastPrompt) {
		throw new Error(`Prompt file was not read: ${relativePath}`);
	}
	return lastPrompt;
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

		let index = await waitForPromptIndex(vault, candidate =>
			candidate.prompts.some(prompt => prompt.name === 'E2E System Prompt' && prompt.enabled === false)
		);
		let entry = index.prompts.find(prompt => prompt.name === 'E2E System Prompt');
		await expect(entry).toEqual(expect.objectContaining({ enabled: false }));

		const promptPath = toPluginRelativePath(entry!.file);
		const promptFile = await waitForPromptFile(vault, promptPath, candidate =>
			candidate.name === 'E2E System Prompt' &&
			candidate.content === 'You are the E2E system prompt sentinel.' &&
			candidate.enabled === false
		);
		await expect(promptFile).toEqual(expect.objectContaining({
			id: entry!.id,
			name: 'E2E System Prompt',
			content: 'You are the E2E system prompt sentinel.',
			enabled: false,
		}));

		await prompts.deletePrompt('E2E System Prompt');

		index = await waitForPromptIndex(vault, candidate =>
			!candidate.prompts.some(prompt => prompt.name === 'E2E System Prompt')
		);
		entry = index.prompts.find(prompt => prompt.name === 'E2E System Prompt');
		await expect(entry).toBeUndefined();
	});
});
