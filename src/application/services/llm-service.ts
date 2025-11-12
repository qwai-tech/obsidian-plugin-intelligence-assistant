/**
 * LLM Service
 * Unified interface for LLM operations
 */

import type { App } from 'obsidian';
import { BaseService } from './base-service';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import type {
	LLMConfig,
	ModelInfo,
	Message,
	ChatRequest,
	ChatResponse,
	StreamChunk,
	ILLMProvider
} from '@/types';

export interface LLMServiceOptions {
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
}

export class LLMService extends BaseService {
	private providers: Map<string, ILLMProvider> = new Map();

	constructor(
		private app: App,
		private configs: LLMConfig[]
	) {
		super();
	}

	async initialize(): Promise<void> {
		// Initialize providers for each config
		for (const config of this.configs) {
			try {
				const provider = ProviderFactory.createProvider(config);
				this.providers.set(config.provider, provider);
			} catch (error) {
				console.error(`[LLMService] Failed to initialize provider ${config.provider}:`, error);
			}
		}

		this.ready = this.providers.size > 0;
	}

	async cleanup(): Promise<void> {
		this.providers.clear();
		this.ready = false;
	}

	/**
	 * Get provider by name
	 */
	getProvider(providerName: string): ILLMProvider | null {
		return this.providers.get(providerName) || null;
	}

	/**
	 * Get provider for model
	 */
	getProviderForModel(modelId: string): ILLMProvider | null {
		const model = this.getModel(modelId);
		if (!model) return null;

		return this.getProvider(model.provider);
	}

	/**
	 * Get model by ID
	 */
	getModel(modelId: string): ModelInfo | null {
		for (const config of this.configs) {
			const model = config.cachedModels?.find(m => m.id === modelId);
			if (model) return model;
		}
		return null;
	}

	/**
	 * Get all available models
	 */
	getAllModels(): ModelInfo[] {
		const models: ModelInfo[] = [];
		for (const config of this.configs) {
			if (config.cachedModels) {
				models.push(...config.cachedModels);
			}
		}
		return models;
	}

	/**
	 * Get models by provider
	 */
	getModelsByProvider(providerName: string): ModelInfo[] {
		const config = this.configs.find(c => c.provider === providerName);
		return config?.cachedModels || [];
	}

	/**
	 * Chat completion
	 */
	async chat(
		modelId: string,
		messages: Message[],
		options?: LLMServiceOptions
	): Promise<ChatResponse> {
		const provider = this.getProviderForModel(modelId);
		if (!provider) {
			throw new Error(`Provider not found for model: ${modelId}`);
		}

		const request: ChatRequest = {
			model: modelId,
			messages,
			temperature: options?.temperature,
			maxTokens: options?.maxTokens,
			stream: false
		};

		return await provider.chat(request);
	}

	/**
	 * Streaming chat completion
	 */
	async streamChat(
		modelId: string,
		messages: Message[],
		onChunk: (chunk: StreamChunk) => void,
		options?: LLMServiceOptions
	): Promise<void> {
		const provider = this.getProviderForModel(modelId);
		if (!provider) {
			throw new Error(`Provider not found for model: ${modelId}`);
		}

		const request: ChatRequest = {
			model: modelId,
			messages,
			temperature: options?.temperature,
			maxTokens: options?.maxTokens,
			stream: true
		};

		await provider.streamChat(request, onChunk);
	}

	/**
	 * Refresh models for a provider
	 */
	async refreshModels(providerName: string): Promise<ModelInfo[]> {
		const config = this.configs.find(c => c.provider === providerName);
		if (!config) {
			throw new Error(`Config not found for provider: ${providerName}`);
		}

		const models = await ModelManager.getModelsForConfig(config, true);
		config.cachedModels = models;
		config.cacheTimestamp = Date.now();

		return models;
	}

	/**
	 * Update configs
	 */
	updateConfigs(configs: LLMConfig[]): void {
		this.configs = configs;
	}

	/**
	 * Check if provider is available
	 */
	isProviderAvailable(providerName: string): boolean {
		return this.providers.has(providerName);
	}

	/**
	 * Get provider names
	 */
	getProviderNames(): string[] {
		return Array.from(this.providers.keys());
	}
}
