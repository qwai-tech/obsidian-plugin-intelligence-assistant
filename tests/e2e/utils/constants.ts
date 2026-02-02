/**
 * Shared constants for E2E tests
 */

/**
 * Mapping of provider identifiers to their display names in the UI
 */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
	'openai': 'OpenAI',
	'anthropic': 'Anthropic',
	'google': 'Google',
	'deepseek': 'DeepSeek',
	'ollama': 'Ollama',
	'openrouter': 'OpenRouter',
	'sap-ai-core': 'SAP AI Core',
	'custom': 'Custom',
} as const;

/**
 * Get the display name for a provider
 * @param provider - The provider identifier (e.g., 'openai')
 * @returns The display name (e.g., 'OpenAI')
 */
export function getProviderDisplayName(provider: string): string {
	return PROVIDER_DISPLAY_NAMES[provider] || provider;
}

/**
 * Default timeout values for tests
 */
export const TIMEOUTS = {
	SHORT: 1000,
	MEDIUM: 3000,
	LONG: 10000,
	REFRESH: 30000,
} as const;
