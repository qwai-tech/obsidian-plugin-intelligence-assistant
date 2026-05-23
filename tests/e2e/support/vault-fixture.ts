import * as fs from 'fs-extra';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const VAULT_ROOT = path.join(REPO_ROOT, 'tests/e2e/test-vault');
const PLUGIN_DIR_REL = '.obsidian/plugins/intelligence-assistant';
const TEMPLATE_ROOT = path.join(REPO_ROOT, 'tests/e2e/fixtures/vault-template');

const LIVE_PLUGIN_DIR = path.join(VAULT_ROOT, PLUGIN_DIR_REL);
const TEMPLATE_PLUGIN_DIR = path.join(TEMPLATE_ROOT, PLUGIN_DIR_REL);

/**
 * Wipe and recreate the test vault's plugin data folder from the template.
 * Called from `onPrepare` hooks and from spec-side `VaultFixture.reset()`.
 */
export async function resetVaultTemplate(): Promise<void> {
	if (!(await fs.pathExists(TEMPLATE_PLUGIN_DIR))) {
		throw new Error(`vault-template missing at ${TEMPLATE_PLUGIN_DIR}`);
	}
	await fs.remove(LIVE_PLUGIN_DIR);
	await fs.ensureDir(path.dirname(LIVE_PLUGIN_DIR));
	await fs.copy(TEMPLATE_PLUGIN_DIR, LIVE_PLUGIN_DIR);
}

/**
 * For the release suite: overlay real provider credentials onto the seed
 * settings file. Reads .env.test for E2E_TEST_PROVIDER, E2E_TEST_API_KEY,
 * E2E_TEST_MODEL. No-op if any are missing — release specs will skip
 * themselves when env detection fails.
 */
export async function seedReleaseProvider(): Promise<void> {
	const provider = process.env.E2E_TEST_PROVIDER;
	const apiKey = process.env.E2E_TEST_API_KEY;
	const model = process.env.E2E_TEST_MODEL;
	if (!provider || !apiKey || !model) return;

	const settingsPath = path.join(
		LIVE_PLUGIN_DIR,
		'config/user/settings.json'
	);
	const settings = await fs.readJson(settingsPath) as Record<string, unknown>;
	const providers = (settings.providers ?? {}) as Record<string, unknown>;
	const list = Array.isArray(providers.list) ? providers.list : [];
	list.unshift({
		provider,
		apiKey,
		baseUrl: process.env.E2E_TEST_BASE_URL ?? '',
		cachedModels: [{ id: model, name: model, provider, capabilities: ['chat', 'streaming'], enabled: true }],
		cacheTimestamp: Date.now(),
	});
	providers.list = list;
	providers.defaultModel = model;
	providers.titleSummaryModel = model;
	settings.providers = providers;
	await fs.writeJson(settingsPath, settings, { spaces: 2 });
}

/**
 * Spec-side helper. Each spec instantiates one of these and calls
 * `await vault.reset()` in `beforeEach`.
 */
export class VaultFixture {
	async reset(): Promise<void> {
		await resetVaultTemplate();
	}

	async readDataFile<T = unknown>(relativePath: string): Promise<T> {
		const full = path.join(LIVE_PLUGIN_DIR, relativePath);
		return fs.readJson(full) as Promise<T>;
	}

	async dataFileExists(relativePath: string): Promise<boolean> {
		return fs.pathExists(path.join(LIVE_PLUGIN_DIR, relativePath));
	}

	getPluginDir(): string {
		return LIVE_PLUGIN_DIR;
	}
}
