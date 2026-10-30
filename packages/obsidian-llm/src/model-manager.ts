import type { LLMConfig, ModelInfo } from './types';
import { DEFAULT_MODELS } from './model-catalog';
import { fetchDeepSeekModels, fetchGoogleModels, fetchOpenAIModels, fetchOpenRouterModels } from './model-fetchers';
import { reportDiagnostic } from './diagnostics';

export class ModelManager {
	private static readonly inFlight = new Map<string, Promise<ModelInfo[]>>();

	/**
	 * Filter models based on regex pattern
	 */
	static filterModels(models: ModelInfo[], filterPattern?: string): ModelInfo[] {
		if (!filterPattern || filterPattern.trim() === '') {
			return models;
		}

		try {
			const regex = new RegExp(filterPattern, 'i'); // Case-insensitive
			return models.filter(model => regex.test(model.id) || regex.test(model.name));
		} catch (error) {
			console.error('Invalid model filter regex:', error);
			reportDiagnostic({ level: 'warn', message: 'Invalid model filter pattern, showing all models' });
			return models;
		}
	}

	static async getModelsForConfig(config: LLMConfig, forceRefresh: boolean = false): Promise<ModelInfo[]> {
		const stored = config.cachedModels ?? [];
		if (!forceRefresh && config.provider !== 'ollama' && stored.length > 0) {
			return this.filterModels(stored, config.modelFilter);
		}
		const models = await this.fetchOnce(config);
		config.cachedModels = models;
		config.cacheTimestamp = Date.now();
		return this.filterModels(models, config.modelFilter);
	}

	private static fetchOnce(config: LLMConfig): Promise<ModelInfo[]> {
		const key = `${config.provider ?? ''}:${config.apiKey ?? ''}:${config.baseUrl ?? ''}`;
		const pending = this.inFlight.get(key);
		if (pending) {
			return pending;
		}
		const request = this.fetchModels(config).finally(() => this.inFlight.delete(key));
		this.inFlight.set(key, request);
		return request;
	}

	private static async fetchModels(config: LLMConfig): Promise<ModelInfo[]> {
		switch (config.provider) {
			case 'ollama':
				return await this.fetchOllamaModels(config);
			case 'anthropic':
				return DEFAULT_MODELS.anthropic;
		}
		if (!config.apiKey) {
			return this.getDefaultModels(config.provider);
		}
		switch (config.provider) {
			case 'openai':
				return await fetchOpenAIModels(config.apiKey, config.baseUrl);
			case 'google':
				return await fetchGoogleModels(config.apiKey, config.baseUrl);
			case 'deepseek':
				return await fetchDeepSeekModels(config.apiKey, config.baseUrl);
			case 'openrouter':
				return await fetchOpenRouterModels(config.apiKey, config.baseUrl);
			case 'custom':
				try {
					return await fetchOpenAIModels(config.apiKey, config.baseUrl);
				} catch (error) {
					console.error('Failed to fetch models from custom provider:', error);
					return [];
				}
			default:
				return [];
		}
	}

	private static async fetchOllamaModels(config: LLMConfig): Promise<ModelInfo[]> {
		try {
			const { OllamaProvider } = await import('./providers/ollama-provider');
			return await new OllamaProvider(config).fetchModels();
		} catch (error) {
			console.error('[ModelManager] Failed to fetch Ollama models:', error);
			return config.cachedModels ?? [];
		}
	}

	/**
	 * Get default models for a provider
	 */
	static getDefaultModels(provider: string): ModelInfo[] {
		return DEFAULT_MODELS[provider] || [];
	}

	/**
	 * Get all available models from all configured providers
	 */
	static async getAllAvailableModels(configs: LLMConfig[]): Promise<ModelInfo[]> {
		const allModels: ModelInfo[] = [];

		for (const config of configs) {
			try {
				const models = await this.getModelsForConfig(config);
				allModels.push(...models);
			} catch (error) {
				console.error(`Failed to get models for ${config.provider}:`, error);
			}
		}

		// Remove duplicates based on id
		const uniqueModels = Array.from(
			new Map(allModels.map(m => [m.id, m])).values()
		);

		return uniqueModels;
	}

	/**
	 * Find which provider config can use a specific model
	 */
	static async findConfigForModel(modelId: string, configs: LLMConfig[]): Promise<LLMConfig | null> {
		// Try to match by provider - fetch models for each config
		for (const config of configs) {
			try {
				const models = await this.getModelsForConfig(config);
				if (models.some(m => m.id === modelId)) {
					return config;
				}
			} catch (error) {
				console.error(`Failed to get models for ${config.provider}:`, error);
			}
		}

		// Fallback to first config
		return configs[0] || null;
	}

	/**
	 * Find provider type from model ID (synchronous, based on model naming patterns)
	 */
	static getProviderFromModelId(modelId: string): string | null {
		if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-')) return 'openai';
		if (modelId.startsWith('claude-')) return 'anthropic';
		if (modelId.startsWith('gemini-')) return 'google';
		if (modelId.startsWith('deepseek-')) return 'deepseek';
		if (modelId.includes('/')) return 'openrouter'; // OpenRouter uses format: provider/model
		return null;
	}

	/**
	 * Find config for model by provider type (faster than fetching all models)
	 */
	static findConfigForModelByProvider(modelId: string, configs: LLMConfig[]): LLMConfig | null {
		// Check if modelId has provider prefix (provider:model-name format)
		if (modelId.includes(':')) {
			const [providerPrefix] = modelId.split(':');

			// Find config matching the provider prefix
			const config = configs.find(c => c.provider === providerPrefix);
			if (config) {
				return config;
			}
		}

		// Fallback: Try to infer provider from model name pattern
		const providerType = this.getProviderFromModelId(modelId);
		if (providerType) {
			const config = configs.find(c => c.provider === providerType);
			if (config) return config;
		}

		// If we can't determine provider from model ID, check each config to see if it contains this model
		for (const config of configs) {
			try {
				// Check if the model exists in cached models first (more efficient)
				if (config.cachedModels && config.cachedModels.some(model => model.id === modelId)) {
					return config;
				}

				// Check if the model exists in default models for the provider
				const defaultModels = this.getDefaultModels(config.provider);
				if (defaultModels.some(model => model.id === modelId)) {
					return config;
				}
			} catch {
				// Continue to next config if there's an error getting models
				continue;
			}
		}

		// If still can't find, return first config as fallback
		return configs[0] || null;
	}
}
