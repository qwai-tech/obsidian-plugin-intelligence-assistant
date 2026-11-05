import type { LLMConfig, ModelInfo } from './types';
import { DEFAULT_MODELS } from './model-catalog';
import { providerDefinition } from './provider-definitions';
import { reportDiagnostic } from './diagnostics';
import { scopeModel } from './model-identity';

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
		const stored = (config.cachedModels ?? []).map(model => Object.assign(model, scopeModel(model, config)));
		config.cachedModels = stored;
		if (!forceRefresh && config.provider !== 'ollama' && stored.length > 0) {
			return this.filterModels(stored, config.modelFilter);
		}
		const switchedOff = new Set(stored.filter((model) => model.enabled === false).map((model) => model.id));
		const models = (await this.fetchOnce(config)).map(model => scopeModel(model, config)).map((model) => (switchedOff.has(model.id) ? { ...model, enabled: false } : { ...model }));
		config.cachedModels = models;
		config.cacheTimestamp = Date.now();
		return this.filterModels(models, config.modelFilter);
	}

	private static fetchOnce(config: LLMConfig): Promise<ModelInfo[]> {
		// SAP discovery is tenant/resource-group specific; never share it across connections.
		if (config.provider === 'sap-ai-core') return this.fetchModels(config);
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
		const definition = providerDefinition(config.provider);
		if (definition.credential === 'api-key' && !config.apiKey?.trim()) throw new Error(`${definition.label} requires an API key`);
		if (config.provider === 'custom' && !config.baseUrl?.trim()) throw new Error('Custom provider requires a base URL');
		return definition.discover(config);
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
	static async getAllChatModels(configs: LLMConfig[]): Promise<ModelInfo[]> {
		return (await this.getAllAvailableModels(configs)).filter(isChatModel);
	}

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
		if (modelId.startsWith('custom@')) return this.findConfigForModelByProvider(modelId, configs);
		const matches: LLMConfig[] = [];
		// Try to match by provider - fetch models for each config
		for (const config of configs) {
			try {
				const models = await this.getModelsForConfig(config);
				if (models.some(m => m.id === modelId)) {
					matches.push(config);
				}
			} catch (error) {
				console.error(`Failed to get models for ${config.provider}:`, error);
			}
		}

		return matches.length === 1 ? matches[0] : null;
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
		// A removed connection must never silently route a request elsewhere.
		if (modelId.startsWith('custom@')) {
			const end = modelId.indexOf(':');
			if (end < 0) return null;
			const id = modelId.slice('custom@'.length, end);
			const matches = configs.filter(config => config.provider === 'custom' && config.id === id);
			return matches.length === 1 ? matches[0] : null;
		}
		// Check if modelId has provider prefix (provider:model-name format)
		if (modelId.includes(':')) {
			const [providerPrefix] = modelId.split(':');

			// Find config matching the provider prefix
			const matching = configs.filter(c => c.provider === providerPrefix);
			if (matching.length === 1) {
				return matching[0];
			}
			if (matching.length > 1) {
				if (providerPrefix === 'custom') return null;
				const exact = matching.filter(config => config.cachedModels?.some(model => model.id === modelId));
				return exact.length === 1 ? exact[0] : null;
			}
			return null;
		}

		// Fallback: Try to infer provider from model name pattern
		const providerType = this.getProviderFromModelId(modelId);
		if (providerType) {
			const matching = configs.filter(c => c.provider === providerType);
			if (matching.length === 1) return matching[0];
		}

		// If we can't determine provider from model ID, check each config to see if it contains this model
		const matches: LLMConfig[] = [];
		for (const config of configs) {
			try {
				// Check if the model exists in cached models first (more efficient)
				if (config.cachedModels && config.cachedModels.some(model => model.id === modelId)) {
					matches.push(config);
					continue;
				}

				// Check if the model exists in default models for the provider
				const defaultModels = this.getDefaultModels(config.provider);
				if (defaultModels.some(model => model.id === modelId)) {
					matches.push(config);
				}
			} catch {
				// Continue to next config if there's an error getting models
				continue;
			}
		}

		return matches.length === 1 ? matches[0] : null;
	}
}

function isChatModel(model: ModelInfo): boolean {
	return !model.capabilities?.length || model.capabilities.includes('chat');
}
