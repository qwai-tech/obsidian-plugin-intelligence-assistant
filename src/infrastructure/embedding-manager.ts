import type { RAGConfig, LLMConfig } from '@/types';
import { ProviderFactory } from './llm/provider-factory';
import { ModelManager } from './llm/model-manager';

interface PluginLookup {
	settings?: {
		llmConfigs?: LLMConfig[];
	};
}

interface WindowWithObsidianPlugins {
	app?: {
		plugins?: {
			plugins?: Record<string, unknown>;
		};
	};
}

export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  provider: string;
  maxTokens?: number;
}

export class EmbeddingManager {
  private static readonly DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

  private static readonly EMBEDDING_MODELS: EmbeddingModel[] = [
    {
      id: 'all-MiniLM-L6-v2',
      name: 'Sentence Transformer: all-MiniLM-L6-v2',
      dimensions: 384,
      provider: 'sentence-transformers'
    },
    {
      id: 'text-embedding-3-small',
      name: 'OpenAI: text-embedding-3-small',
      dimensions: 1536,
      provider: 'openai'
    },
    {
      id: 'text-embedding-3-large',
      name: 'OpenAI: text-embedding-3-large',
      dimensions: 3072,
      provider: 'openai'
    },
    {
      id: 'text-embedding-ada-002',
      name: 'OpenAI: text-embedding-ada-002',
      dimensions: 1536,
      provider: 'openai'
    }
  ];

  static getDefaultEmbeddingModel(): EmbeddingModel {
    return this.EMBEDDING_MODELS.find(m => m.id === this.DEFAULT_EMBEDDING_MODEL) || this.EMBEDDING_MODELS[0];
  }

  static getAllEmbeddingModels(llmConfigs?: LLMConfig[]): EmbeddingModel[] {
    const embeddingModels = [...this.EMBEDDING_MODELS];

    try {
      const configs = llmConfigs ?? this.getPluginInstance()?.settings?.llmConfigs;
      if (configs) {
        configs.forEach((config) => {
          if (config.cachedModels) {
            config.cachedModels.forEach((model) => {
              if (model.capabilities?.includes('embedding') && model.enabled !== false) {
                const exists = embeddingModels.some(m => m.id === model.id);
                if (!exists) {
                  embeddingModels.push({
                    id: model.id,
                    name: `${model.name ?? 'unknown'} (${model.provider})`,
                    dimensions: 1536,
                    provider: model.provider,
                    maxTokens: 8192
                  });
                }
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('[EmbeddingManager] Error loading LLM embedding models:', error);
    }

    return embeddingModels;
  }

  static getEmbeddingModelById(id: string): EmbeddingModel | undefined {
    const builtInModel = this.EMBEDDING_MODELS.find(m => m.id === id);
    if (builtInModel) {
      return builtInModel;
    }

    const allModels = this.getAllEmbeddingModels();
    return allModels.find(m => m.id === id);
  }

  static getEmbeddingModelForConfig(config: RAGConfig): EmbeddingModel {
    if (config.embeddingModel) {
      const model = this.getEmbeddingModelById(config.embeddingModel);
      if (model) {
        return model;
      }
    }
    return this.getDefaultEmbeddingModel();
  }

  static async generateEmbedding(text: string, modelId?: string, llmConfigs?: LLMConfig[]): Promise<number[]> {
    const model = modelId
      ? this.getEmbeddingModelById(modelId)
      : this.getDefaultEmbeddingModel();

    if (!model) {
      throw new Error(`Embedding model ${modelId ?? ''} not found`);
    }

    const configs = llmConfigs ?? this.getPluginInstance()?.settings?.llmConfigs;
    if (!configs) {
      throw new Error('No LLM configs available for embedding generation');
    }

    const config = ModelManager.findConfigForModelByProvider(model.id, configs);
    if (!config) {
      throw new Error(`No provider configuration found for embedding model: ${model.id}`);
    }

    const provider = ProviderFactory.createProvider(config);
    if (typeof provider.generateEmbedding !== 'function') {
      throw new Error(`Provider ${config.provider} does not support embeddings`);
    }

    return provider.generateEmbedding(text, model.id);
  }

  private static getPluginInstance(): PluginLookup | null {
    if (typeof window !== 'undefined') {
      const plugin = (window as Window & WindowWithObsidianPlugins).app?.plugins?.plugins?.['intelligence-assistant'];
      if (plugin && typeof plugin === 'object') {
        return plugin as PluginLookup;
      }
    }
    return null;
  }

  static cleanup(): void {
    // No worker to terminate after embedding refactor
  }
}
