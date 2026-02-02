/**
 * Global E2E Test Setup
 * Configures test vault with provider settings before running tests
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import type { UserConfig } from '../../../src/types/settings';
import type { LLMConfig, ModelInfo } from '../../../src/types/core/model';
import type { MCPServerConfig } from '../../../src/types/features/mcp';
import { testConfig } from './test-config';

const TEST_VAULT_PATH = path.join(__dirname, '../test-vault');
const OBSIDIAN_DIR = path.join(TEST_VAULT_PATH, '.obsidian');
const PLUGIN_BASE_DIR = path.join(OBSIDIAN_DIR, 'plugins/intelligence-assistant');
const USER_CONFIG_DIR = path.join(PLUGIN_BASE_DIR, 'config/user');
const SETTINGS_JSON_PATH = path.join(USER_CONFIG_DIR, 'settings.json');

const SEEDED_MODEL_TIMESTAMP = Date.now() - 60 * 60 * 1000;
const SEEDED_MODELS: ModelInfo[] = [
	{
		id: 'gpt-4o-mini',
		name: 'GPT-4o Mini',
		provider: 'openai',
		capabilities: ['chat', 'vision', 'json_mode', 'streaming'],
		enabled: true,
	},
	{
		id: 'text-embedding-3-small',
		name: 'Text Embedding 3 Small',
		provider: 'openai',
		capabilities: ['embedding'],
		enabled: true,
	},
];

const SEEDED_PROVIDERS: LLMConfig[] = [
	{
		provider: 'openai',
		apiKey: 'sk-test-openai',
		baseUrl: 'https://api.openai.com/v1',
		cachedModels: SEEDED_MODELS,
		cacheTimestamp: SEEDED_MODEL_TIMESTAMP,
	},
	{
		provider: 'ollama',
		baseUrl: 'http://localhost:11434',
		cachedModels: [],
	},
];

const SEEDED_MCP_SERVERS: MCPServerConfig[] = [
	{
		name: 'Demo Auto MCP',
		command: 'node demo-mcp.js',
		args: ['--port', '8080'],
		env: { DEMO: 'true' },
		enabled: true,
		connectionMode: 'auto',
		cachedTools: [
			{ name: 'demo-tool', description: 'Seeded demo tool', args: [] },
		],
		cacheTimestamp: SEEDED_MODEL_TIMESTAMP,
	},
	{
		name: 'Disabled MCP',
		command: '',
		args: [],
		env: {},
		enabled: false,
		connectionMode: 'manual',
		cachedTools: [],
	},
];

function seedLlMConfig(config: UserConfig): UserConfig {
	const seeded = JSON.parse(JSON.stringify(config)) as UserConfig;
	const hasProviders = Array.isArray(seeded.providers?.list) && seeded.providers.list.length > 0;
	if (!hasProviders) {
		const clonedSeed = JSON.parse(JSON.stringify(SEEDED_PROVIDERS)) as LLMConfig[];
		seeded.providers = {
			...seeded.providers,
			defaultModel: seeded.providers?.defaultModel || SEEDED_MODELS[0].id,
			titleSummaryModel: seeded.providers?.titleSummaryModel || SEEDED_MODELS[0].id,
			list: clonedSeed,
		};
	} else {
		seeded.providers.defaultModel = seeded.providers.defaultModel || SEEDED_MODELS[0].id;
		seeded.providers.titleSummaryModel = seeded.providers.titleSummaryModel || SEEDED_MODELS[0].id;
	}

	if (seeded.rag?.embedding && !seeded.rag.embedding.model) {
		seeded.rag.embedding.model = 'text-embedding-3-small';
	}

	seeded.mcp = seeded.mcp ?? { servers: [], registries: [] };
	if (!Array.isArray(seeded.mcp.servers) || seeded.mcp.servers.length === 0) {
		seeded.mcp.servers = JSON.parse(JSON.stringify(SEEDED_MCP_SERVERS));
	}

	return seeded;
}

/**
 * Setup test vault configuration
 */
export async function setupTestVault(): Promise<void> {
	console.log('[Setup] Configuring test vault...');

	// Ensure plugin folder hierarchy exists (.obsidian/plugins/intelligence-assistant/config/user)
	await fs.ensureDir(USER_CONFIG_DIR);

	let existingConfig: Partial<UserConfig> | undefined;
	if (await fs.pathExists(SETTINGS_JSON_PATH)) {
		try {
			existingConfig = (await fs.readJson(SETTINGS_JSON_PATH)) as Partial<UserConfig>;
			console.log('[Setup] Loaded existing settings.json');
		} catch (error) {
			console.warn('[Setup] Invalid settings.json detected, regenerating fresh config');
		}
	}

	let resolvedConfig = testConfig.getUserConfig(existingConfig);
	resolvedConfig = seedLlMConfig(resolvedConfig);
	if (testConfig.hasProvider()) {
		console.log(`[Setup] Configured provider: ${testConfig.providerConfig?.provider}`);
	} else {
		console.log('[Setup] No provider configured - tests will run without LLM');
	}

	await fs.writeJson(SETTINGS_JSON_PATH, resolvedConfig, { spaces: 2 });
	console.log(`[Setup] Configuration written to ${SETTINGS_JSON_PATH}`);
}

/**
 * Cleanup test vault after tests
 */
export async function cleanupTestVault(): Promise<void> {
	console.log('[Cleanup] Test vault cleanup complete');
	// Could add cleanup logic here if needed
}

// Export for use in wdio.conf.ts hooks
export default {
	setupTestVault,
	cleanupTestVault,
};
