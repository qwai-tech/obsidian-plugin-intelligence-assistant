import type { LLMConfig, ModelInfo, ModelCapability } from '@/types';
import { Notice, requestUrl } from 'obsidian';

export class ModelManager {
	private static modelCache = new Map<string, Promise<ModelInfo[]>>();
	// Default model lists for each provider
	private static readonly DEFAULT_MODELS: Record<string, ModelInfo[]> = {
		openai: [
			{ id: 'openai:o1', name: 'O1', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
			{ id: 'openai:o1-mini', name: 'O1 Mini', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
			{ id: 'openai:o3-mini', name: 'O3 Mini', provider: 'openai', capabilities: ['chat', 'reasoning', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-5', name: 'GPT-5', provider: 'openai', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-4', name: 'GPT-4', provider: 'openai', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openai:text-embedding-3-large', name: 'Text Embedding 3 Large', provider: 'openai', capabilities: ['embedding'], enabled: true },
			{ id: 'openai:text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', capabilities: ['embedding'], enabled: true },
		],
		anthropic: [
			{ id: 'anthropic:claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode', 'computer_use'], enabled: true },
			{ id: 'anthropic:claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'anthropic:claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'anthropic:claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'anthropic:claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		],
		google: [
			{ id: 'google:gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode', 'multimodal_output', 'code_execution'], enabled: true },
			{ id: 'google:gemini-2.0-flash-thinking-exp', name: 'Gemini 2.0 Flash Thinking (Experimental)', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'reasoning', 'streaming', 'json_mode', 'multimodal_output', 'code_execution'], enabled: true },
			{ id: 'google:gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'google:gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'google:gemini-pro', name: 'Gemini Pro', provider: 'google', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		],
		deepseek: [
			{ id: 'deepseek:deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'deepseek:deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', capabilities: ['chat', 'reasoning', 'streaming', 'json_mode'], enabled: true },
			{ id: 'deepseek:deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		],
		openrouter: [
			{ id: 'openrouter:openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openrouter:openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openrouter:anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode', 'computer_use'], enabled: true },
			{ id: 'openrouter:google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', provider: 'openrouter', capabilities: ['chat', 'vision', 'audio', 'video', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'openrouter:meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'openrouter', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
		],
		'sap-ai-core': [
			{ id: 'sap-ai-core:gpt-4o', name: 'GPT-4o', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-35-turbo', name: 'GPT-3.5 Turbo', provider: 'sap-ai-core', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:text-embedding-ada-002', name: 'Text Embedding Ada', provider: 'sap-ai-core', capabilities: ['embedding'], enabled: true },
		],
	};

	/**
	 * Infer OpenAI model capabilities from model ID
	 */
	private static inferOpenAICapabilities(modelId: string): ModelCapability[] {
		const capabilities: ModelCapability[] = [];

		// Embedding models
		if (modelId.includes('embedding')) {
			return ['embedding'];
		}

		// All chat models have these
		capabilities.push('chat', 'streaming', 'json_mode');

		// Reasoning models (o1, o3 series)
		if (modelId.startsWith('o1') || modelId.startsWith('o3')) {
			capabilities.push('reasoning');
			return capabilities; // o1/o3 don't have vision or function calling
		}

		// GPT-4o and GPT-4o-mini have audio
		if (modelId.includes('gpt-4o')) {
			capabilities.push('vision', 'audio', 'function_calling');
			return capabilities;
		}

		// GPT-4 with vision (turbo, vision preview)
		if (modelId.includes('gpt-4') && (modelId.includes('turbo') || modelId.includes('vision'))) {
			capabilities.push('vision', 'function_calling');
			return capabilities;
		}

		// GPT-4 base and GPT-3.5-turbo
		if (modelId.includes('gpt-4') || modelId.includes('gpt-3.5')) {
			capabilities.push('function_calling');
			return capabilities;
		}

		// GPT-5 series (future models)
		if (modelId.includes('gpt-5')) {
			capabilities.push('vision', 'function_calling');
			return capabilities;
		}

		return capabilities;
	}

	/**
	 * Fetch available models from OpenAI API
	 */
	static async fetchOpenAIModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
		try {
			const url = baseUrl
				? `${baseUrl}/models`
				: 'https://api.openai.com/v1/models';

			const response = await requestUrl({
				url,
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch models: ${response.status}`);
			}

			const data = response.json; // Note: response.json is a property, not a method in Obsidian's requestUrl

			// Filter and map to ModelInfo
			return data.data
				.filter((model: any) => model.id.startsWith('gpt') || model.id.startsWith('o1') || model.id.startsWith('o3') || model.id.includes('embedding'))
				.map((model: any) => {
					// Try to find capabilities from default models first
					const prefixedId = `openai:${model.id}`;
					const defaultModel = this.DEFAULT_MODELS.openai.find(m => m.id === prefixedId);
					const capabilities = defaultModel?.capabilities || this.inferOpenAICapabilities(model.id);

					return {
						id: prefixedId,
						name: model.id,
						provider: 'openai',
						capabilities: capabilities,
						enabled: true
					};
				})
				.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
		} catch (error) {
			console.error('Failed to fetch OpenAI models:', error);
			new Notice('Failed to fetch OpenAI models, using default list');
			return this.DEFAULT_MODELS.openai;
		}
	}

	/**
	 * Get Anthropic models (they don't have a models list API)
	 */
	static getAnthropicModels(): ModelInfo[] {
		return this.DEFAULT_MODELS.anthropic;
	}

	/**
	 * Infer Google Gemini model capabilities from model ID
	 */
	private static inferGoogleCapabilities(modelId: string): ModelCapability[] {
		const capabilities: ModelCapability[] = ['chat', 'streaming', 'json_mode'];

		// Gemini 2.0 models
		if (modelId.includes('gemini-2')) {
			capabilities.push('vision', 'audio', 'video', 'function_calling');
			capabilities.push('multimodal_output', 'code_execution');

			// Thinking/reasoning variant
			if (modelId.includes('thinking')) {
				capabilities.push('reasoning');
			}
			return capabilities;
		}

		// Gemini 1.5 models
		if (modelId.includes('gemini-1.5')) {
			capabilities.push('vision', 'audio', 'video', 'function_calling');
			return capabilities;
		}

		// Gemini Pro (1.0)
		if (modelId.includes('gemini-pro')) {
			capabilities.push('function_calling');
			return capabilities;
		}

		return capabilities;
	}

	/**
	 * Fetch available models from Google API
	 */
	static async fetchGoogleModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
		try {
			const url = baseUrl
				? `${baseUrl}/models?key=${apiKey}`
				: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

			const response = await requestUrl({ url, method: "GET" });

			if (response.status !== 200) {
				throw new Error(`Failed to fetch models: ${response.status}`);
			}

			const data = response.json;

			// Filter and map to ModelInfo
			return data.models
				.filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
				.map((model: any) => {
					const modelId = model.name.replace('models/', '');
					const prefixedId = `google:${modelId}`;
					const defaultModel = this.DEFAULT_MODELS.google.find(m => m.id === prefixedId);
					const capabilities = defaultModel?.capabilities || this.inferGoogleCapabilities(modelId);

					return {
						id: prefixedId,
						name: model.displayName || modelId,
						provider: 'google',
						capabilities: capabilities,
						enabled: true
					};
				})
				.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
		} catch (error) {
			console.error('Failed to fetch Google models:', error);
			new Notice('Failed to fetch Google models, using default list');
			return this.DEFAULT_MODELS.google;
		}
	}

	/**
	 * Infer DeepSeek model capabilities from model ID
	 */
	private static inferDeepSeekCapabilities(modelId: string): ModelCapability[] {
		const capabilities: ModelCapability[] = ['chat', 'streaming', 'json_mode'];

		// Reasoning models (R1, reasoner)
		if (modelId.includes('reasoner') || modelId.includes('-r1')) {
			capabilities.push('reasoning');
			return capabilities;
		}

		// DeepSeek V3 and coder models support function calling
		if (modelId.includes('v3') || modelId.includes('coder') || modelId.includes('chat')) {
			capabilities.push('function_calling');
		}

		return capabilities;
	}

	/**
	 * Fetch available models from DeepSeek API (OpenAI-compatible)
	 */
	static async fetchDeepSeekModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
		try {
			const url = baseUrl
				? `${baseUrl}/models`
				: 'https://api.deepseek.com/v1/models';

			const response = await requestUrl({
				url,
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch models: ${response.status}`);
			}

			const data = response.json; // Note: response.json is a property, not a method in Obsidian's requestUrl

			// Filter and map to ModelInfo
			return data.data
				.map((model: any) => {
					const prefixedId = `deepseek:${model.id}`;
					const defaultModel = this.DEFAULT_MODELS.deepseek.find(m => m.id === prefixedId);
					const capabilities = defaultModel?.capabilities || this.inferDeepSeekCapabilities(model.id);

					return {
						id: prefixedId,
						name: model.id,
						provider: 'deepseek',
						capabilities: capabilities,
						enabled: true
					};
				})
				.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
		} catch (error) {
			console.error('Failed to fetch DeepSeek models:', error);
			new Notice('Failed to fetch DeepSeek models, using default list');
			return this.DEFAULT_MODELS.deepseek;
		}
	}

	/**
	 * Fetch available models from OpenRouter API
	 */
	static async fetchOpenRouterModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
		try {
			const url = baseUrl
				? `${baseUrl}/models`
				: 'https://openrouter.ai/api/v1/models';

			const response = await requestUrl({
				url,
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://obsidian.md',
					'X-Title': 'Obsidian Intelligence Assistant',
				},
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch models: ${response.status}`);
			}

			const data = response.json; // Note: response.json is a property, not a method in Obsidian's requestUrl

			// Filter and map to ModelInfo
			return data.data
				.map((model: any) => {
					// Infer capabilities from OpenRouter's model metadata
					const capabilities: ModelCapability[] = ['chat']; // All models support chat

					// Check architecture for multimodal capabilities
					if (model.architecture?.input_modalities) {
						const inputModalities = model.architecture.input_modalities;
						if (inputModalities.includes('image')) capabilities.push('vision');
						if (inputModalities.includes('audio')) capabilities.push('audio');
						if (inputModalities.includes('video')) capabilities.push('video');
					}

					// Check modality string for vision support (fallback)
					if (model.architecture?.modality?.includes('image')) {
						if (!capabilities.includes('vision')) capabilities.push('vision');
					}

					// Check supported_parameters for advanced features
					if (model.supported_parameters) {
						const params = model.supported_parameters;
						if (params.includes('tools') || params.includes('tool_choice')) {
							capabilities.push('function_calling');
						}
						if (params.includes('response_format') || params.includes('structured_outputs')) {
							capabilities.push('json_mode');
						}
						if (params.includes('reasoning') || params.includes('include_reasoning')) {
							capabilities.push('reasoning');
						}
					}

					// All OpenRouter models support streaming
					capabilities.push('streaming');

					const prefixedId = `openrouter:${model.id}`;

					// Check for embedding models
					if (model.id.includes('embedding') || model.architecture?.modality === 'text->embedding') {
						return {
							id: prefixedId,
							name: model.name || model.id,
							provider: 'openrouter',
							capabilities: ['embedding'],
							enabled: true
						};
					}

					return {
						id: prefixedId,
						name: model.name || model.id,
						provider: 'openrouter',
						capabilities: capabilities,
						enabled: true
					};
				})
				.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
		} catch (error) {
			console.error('Failed to fetch OpenRouter models:', error);
			new Notice('Failed to fetch OpenRouter models, using default list');
			return this.DEFAULT_MODELS.openrouter;
		}
	}

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
			new Notice('Invalid model filter pattern, showing all models');
			return models;
		}
	}

	/**
	 * Get models for a specific config
	 */
	static async getModelsForConfig(config: LLMConfig, forceRefresh: boolean = false): Promise<ModelInfo[]> {
		const cacheKey = `${config.provider}:${config.apiKey}:${config.baseUrl}`;

		if (!forceRefresh && this.modelCache.has(cacheKey)) {
			console.log(`Using cached models for ${config.provider}`);
			return this.filterModels(await this.modelCache.get(cacheKey)!, config.modelFilter);
		}

		const fetchPromise = (async () => {
			// Use stored models if available (persistent storage, no expiration)
			if (!forceRefresh && config.cachedModels && config.cachedModels.length > 0) {
				console.log(`Using stored models for ${config.provider} (${config.cachedModels.length} models)`);
				return config.cachedModels;
			}

			// No stored models or force refresh, fetch fresh models
			let models: ModelInfo[] = [];

			// Special handling for providers that don't require API keys
			if (config.provider === 'ollama') {
				console.log('[ModelManager] Fetching Ollama models (no API key required)...');
				const { OllamaProvider } = await import('./ollama-provider');
				const ollamaProvider = new OllamaProvider(config);
				models = await ollamaProvider.fetchModels();
			} else if (config.provider === 'sap-ai-core') {
				console.log('[ModelManager] Fetching SAP AI Core models...');
				// Try to fetch from SAP AI Core provider
				try {
					const { SAPAICoreProvider } = await import('./sap-ai-core-provider');
					const sapProvider = new SAPAICoreProvider(config);
					models = await sapProvider.fetchModels();
				} catch (error) {
					console.error('[ModelManager] Failed to fetch SAP AI Core models:', error);
					models = this.DEFAULT_MODELS['sap-ai-core'];
				}
			} else if (!config.apiKey) {
				console.log(`[ModelManager] No API key for ${config.provider}, using default models`);
				models = this.getDefaultModels(config.provider);
			} else {
				switch (config.provider) {
					case 'openai':
						models = await this.fetchOpenAIModels(config.apiKey, config.baseUrl);
						break;
					case 'anthropic':
						// Anthropic doesn't have a models API, use default list
						models = this.DEFAULT_MODELS.anthropic;
						break;
					case 'google':
						models = await this.fetchGoogleModels(config.apiKey, config.baseUrl);
						break;
					case 'deepseek':
						models = await this.fetchDeepSeekModels(config.apiKey, config.baseUrl);
						break;
					case 'openrouter':
						models = await this.fetchOpenRouterModels(config.apiKey, config.baseUrl);
						break;
					case 'custom':
						// For custom providers, try to fetch models if it's OpenAI-compatible
						try {
							models = await this.fetchOpenAIModels(config.apiKey, config.baseUrl);
						} catch (error) {
							console.error('Failed to fetch models from custom provider:', error);
							models = [];
						}
						break;
					default:
						models = [];
				}
			}
			return models;
		})();

		this.modelCache.set(cacheKey, fetchPromise);

		const models = await fetchPromise;

		// Apply filter if specified
		return this.filterModels(models, config.modelFilter);
	}

	/**
	 * Get default models for a provider
	 */
	static getDefaultModels(provider: string): ModelInfo[] {
		return this.DEFAULT_MODELS[provider] || [];
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
			const [providerPrefix, ...rest] = modelId.split(':');
			const modelName = rest.join(':'); // Handle case where model name might contain ':'

			// Find config matching the provider prefix
			const config = configs.find(c => c.provider === providerPrefix);
			if (config) {
				console.log(`Found config for provider-prefixed model: ${modelId} -> ${providerPrefix}`);
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
			} catch (error) {
				// Continue to next config if there's an error getting models
				continue;
			}
		}

		// If still can't find, return first config as fallback
		return configs[0] || null;
	}
}
