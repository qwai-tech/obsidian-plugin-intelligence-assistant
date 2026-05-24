import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const VAULT_ROOT = path.join(REPO_ROOT, 'tests/e2e/test-vault');
const PLUGIN_DIR_REL = '.obsidian/plugins/intelligence-assistant';
const TEMPLATE_ROOT = path.join(REPO_ROOT, 'tests/e2e/fixtures/vault-template');

const LIVE_PLUGIN_DIR = path.join(VAULT_ROOT, PLUGIN_DIR_REL);
const TEMPLATE_PLUGIN_DIR = path.join(TEMPLATE_ROOT, PLUGIN_DIR_REL);

/**
 * Subdirectories of the plugin folder that hold runtime state.
 * `config/` is the user settings.json; `data/` holds conversations,
 * vector store, cache, agents, prompts, openapi tools, etc.
 *
 * The plugin binary (main.js, manifest.json, styles.css, main.js.map)
 * lives outside these — wdio-obsidian-service installs it once at session
 * start, and resets MUST NOT touch it or the next test sees no plugin.
 */
const RESET_SUBDIRS = ['config', 'data'] as const;

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function readJson<T>(p: string): Promise<T> {
	const raw = await fs.readFile(p, 'utf-8');
	return JSON.parse(raw) as T;
}

async function writeJson(p: string, data: unknown): Promise<void> {
	await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Reset runtime state subdirectories from the template. Leaves the plugin
 * binary intact. Safe to call before every spec.
 */
export async function resetVaultTemplate(): Promise<void> {
	if (!(await pathExists(TEMPLATE_PLUGIN_DIR))) {
		throw new Error(`vault-template missing at ${TEMPLATE_PLUGIN_DIR}`);
	}
	await fs.mkdir(LIVE_PLUGIN_DIR, { recursive: true });

	for (const sub of RESET_SUBDIRS) {
		const live = path.join(LIVE_PLUGIN_DIR, sub);
		const tmpl = path.join(TEMPLATE_PLUGIN_DIR, sub);
		await fs.rm(live, { recursive: true, force: true });
		if (await pathExists(tmpl)) {
			await fs.cp(tmpl, live, { recursive: true });
		} else {
			// template has no contents for this subdir; ensure the dir exists empty
			await fs.mkdir(live, { recursive: true });
		}
	}
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

	const settingsPath = path.join(LIVE_PLUGIN_DIR, 'config/user/settings.json');
	const settings = await readJson<Record<string, unknown>>(settingsPath);
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
	await writeJson(settingsPath, settings);
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
		return readJson<T>(path.join(LIVE_PLUGIN_DIR, relativePath));
	}

	async dataFileExists(relativePath: string): Promise<boolean> {
		return pathExists(path.join(LIVE_PLUGIN_DIR, relativePath));
	}

	getPluginDir(): string {
		return LIVE_PLUGIN_DIR;
	}
}
