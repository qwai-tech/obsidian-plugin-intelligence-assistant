/**
 * E2E Test Configuration helpers
 * Aligns the temporary vault settings with the plugin's real config structure
 */

import * as dotenv from 'dotenv';
import type { UserConfig } from '../../../src/types/settings';
import type { LLMConfig } from '../../../src/types/core/model';
import defaultUserConfigJson from '../../../config/default/settings.json';

// Load environment variables from .env.test if it exists
// Must be done before any code that accesses process.env
dotenv.config({ path: '.env.test' });

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Array<infer U>
		? Array<U>
		: T[P] extends object
			? DeepPartial<T[P]>
			: T[P];
};

const DEFAULT_USER_CONFIG = defaultUserConfigJson as UserConfig;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function mergeDeep<T>(target: T, source?: DeepPartial<T>): T {
	if (!source) {
		return target;
	}

	for (const key of Object.keys(source) as (keyof T)[]) {
		const incoming = source[key];
		if (incoming === undefined) {
			continue;
		}

		if (Array.isArray(incoming)) {
			(target as Record<string, unknown>)[key as string] = clone(incoming);
			continue;
		}

		if (incoming && typeof incoming === 'object') {
			const current = target[key];
			const base = current && typeof current === 'object' ? clone(current) : {};
			(target as Record<string, unknown>)[key as string] = mergeDeep(base, incoming as DeepPartial<T[typeof key]>);
			continue;
		}

		(target as Record<string, unknown>)[key as string] = incoming as T[typeof key];
	}

	return target;
}

export interface TestProviderConfig {
	enabled: boolean;
	provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek';
	apiKey: string;
	model: string;
	baseUrl?: string;
}

export class TestConfig {
	private static instance: TestConfig;
	public providerConfig: TestProviderConfig | null = null;

	private constructor() {
		this.loadProviderConfig();
	}

	static getInstance(): TestConfig {
		if (!TestConfig.instance) {
			TestConfig.instance = new TestConfig();
		}
		return TestConfig.instance;
	}

	private loadProviderConfig(): void {
		// Check for provider configuration in environment variables
		const provider = process.env.E2E_TEST_PROVIDER as 'openai' | 'anthropic' | 'gemini' | 'deepseek' | undefined;
		const apiKey = process.env.E2E_TEST_API_KEY;
		const model = process.env.E2E_TEST_MODEL;
		const baseUrl = process.env.E2E_TEST_BASE_URL;

		if (provider && apiKey) {
			this.providerConfig = {
				enabled: true,
				provider,
				apiKey,
				model: model || this.getDefaultModel(provider),
				baseUrl: baseUrl || this.getDefaultBaseUrl(provider),
			};

			console.log(`[Test Config] Provider configured: ${provider} with model ${this.providerConfig.model}`);
			if (this.providerConfig.baseUrl) {
				console.log(`[Test Config] Using custom base URL: ${this.providerConfig.baseUrl}`);
			}
		} else {
			console.log('[Test Config] No provider configured - tests will use lenient assertions');
		}
	}

	private getDefaultModel(provider: string): string {
		const defaults: Record<string, string> = {
			'openai': 'gpt-3.5-turbo',
			'anthropic': 'claude-3-haiku-20240307',
			'gemini': 'gemini-pro',
			'deepseek': 'deepseek-chat',
		};
		return defaults[provider] || 'gpt-3.5-turbo';
	}

	private getDefaultBaseUrl(provider: string): string | undefined {
		const defaults: Record<string, string | undefined> = {
			'openai': undefined, // Use OpenAI's default
			'anthropic': undefined,
			'gemini': undefined,
			'deepseek': 'https://api.deepseek.com/v1',
		};
		return defaults[provider];
	}

	/**
	 * Check if a real provider is configured for testing
	 */
	hasProvider(): boolean {
		return this.providerConfig !== null && this.providerConfig.enabled;
	}

	private buildProviderEntry(): LLMConfig {
		if (!this.providerConfig) {
			return {
				provider: 'openai',
			};
		}

		const { provider, apiKey, baseUrl } = this.providerConfig;
		const llmConfig: LLMConfig = { provider };
		if (apiKey) {
			llmConfig.apiKey = apiKey;
		}
		if (baseUrl) {
			llmConfig.baseUrl = baseUrl;
		}
		return llmConfig;
	}

	/**
	 * Generate the user-config payload the plugin expects on disk.
	 * Optionally merges an existing (possibly partial) config from the vault.
	 */
	getUserConfig(existingConfig?: DeepPartial<UserConfig>): UserConfig {
		const mergedConfig = mergeDeep(clone(DEFAULT_USER_CONFIG), existingConfig);

		if (this.providerConfig) {
			const llmConfig = this.buildProviderEntry();
			mergedConfig.providers.list = [llmConfig];
			mergedConfig.providers.defaultModel = this.providerConfig.model;
			mergedConfig.providers.titleSummaryModel = this.providerConfig.model;
		} else {
			// Ensure at least an empty providers list exists
			mergedConfig.providers.list = mergedConfig.providers.list ?? [];
		}

		return mergedConfig;
	}
}

// Export singleton instance
export const testConfig = TestConfig.getInstance();
