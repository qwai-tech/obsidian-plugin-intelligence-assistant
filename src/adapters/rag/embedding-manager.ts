import type { LLMConfig } from '@/features/llm';
import { ProviderFactory } from '@qwai/obsidian-llm';

export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  provider: string;
  maxTokens?: number;
}

export class EmbeddingManager {
  private static readonly DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
  private static readonly EMBEDDING_CAPABLE_PROVIDERS = new Set(['openai', 'google', 'ollama', 'openrouter', 'custom', 'sap-ai-core']);

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

  static getAllEmbeddingModels(llmConfigs: LLMConfig[]): EmbeddingModel[] {
    const embeddingModels = [...this.EMBEDDING_MODELS];
    for (const model of llmConfigs.flatMap(config => config.cachedModels ?? [])) {
      if (model.capabilities?.includes('embedding') && model.enabled !== false && !embeddingModels.some(m => m.id === model.id)) {
        embeddingModels.push({
          id: model.id,
          name: `${model.name ?? 'unknown'} (${model.provider})`,
          dimensions: 1536,
          provider: model.provider,
          maxTokens: 8192
        });
      }
    }
    return embeddingModels;
  }

  static getEmbeddingModelById(id: string, llmConfigs: LLMConfig[]): EmbeddingModel | undefined {
    const builtInModel = this.EMBEDDING_MODELS.find(m => m.id === id);
    if (builtInModel) {
      return builtInModel;
    }

    const allModels = this.getAllEmbeddingModels(llmConfigs);
    return allModels.find(m => m.id === id);
  }

  static async generateEmbedding(text: string, modelId: string | undefined, llmConfigs: LLMConfig[], signal?: AbortSignal): Promise<number[]> {
    const model = modelId
      ? this.getEmbeddingModelById(modelId, llmConfigs)
      : this.getDefaultEmbeddingModel();

    if (!model) {
      throw new Error(`Embedding model ${modelId ?? ''} not found`);
    }

    const config = this.findConfigForEmbeddingModel(model, llmConfigs);
    if (!config) {
      throw new Error(`Embedding model ${model.id} does not have a configured embedding provider (${model.provider})`);
    }

    if (!this.EMBEDDING_CAPABLE_PROVIDERS.has(config.provider)) {
      throw new Error(`Provider ${config.provider} does not support embeddings. Choose an OpenAI, Google, Ollama, OpenRouter, SAP AI Core, or custom embedding model in RAG settings.`);
    }

    const provider = ProviderFactory.createProvider(config);
    if (typeof provider.generateEmbedding !== 'function') {
      throw new Error(`Provider ${config.provider} does not support embeddings`);
    }

    return provider.generateEmbedding(text, model.id, { signal });
  }

  private static findConfigForEmbeddingModel(model: EmbeddingModel, configs: LLMConfig[]): LLMConfig | null {
    const cachedOwner = configs.find(config =>
      config.cachedModels?.some(cachedModel =>
        cachedModel.id === model.id &&
        cachedModel.enabled !== false &&
        cachedModel.capabilities?.includes('embedding')
      )
    );
    if (cachedOwner) {
      return cachedOwner;
    }

    return configs.find(config => config.provider === model.provider) ?? null;
  }
}
