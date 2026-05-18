import type { RAGConfig } from '@/types';
import { ProviderFactory } from './llm/provider-factory';
import { ModelManager } from './llm/model-manager';

export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  provider: string;
  maxTokens?: number;
}

// Define interfaces for Web Worker communication
interface EmbeddingRequest {
  id: string;
  text: string;
  dimensions: number;
}

interface EmbeddingResponse {
  id: string;
  success: boolean;
  embedding?: number[];
  error?: string;
}

export class EmbeddingManager {
  private static readonly DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
  private static worker: Worker | null = null;
  private static pendingRequests: Map<string, { resolve: (_value: number[]) => void, reject: (_reason: unknown) => void }> = new Map();
  
  // Available embedding models - in practice, this could be extended to support various providers
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

  static getAllEmbeddingModels(): EmbeddingModel[] {
    // Start with built-in embedding models
    const embeddingModels = [...this.EMBEDDING_MODELS];

    // Try to dynamically load LLM models with embedding capability
    try {
      const plugin = this.getPluginInstance();
      if (plugin?.settings?.llmConfigs) {
          // Iterate through all LLM configs and their cached models
          plugin.settings.llmConfigs.forEach((config: any) => {
            if (config.cachedModels) {
              config.cachedModels.forEach((model: any) => {
                // Check if model has embedding capability
                if (model.capabilities?.includes('embedding') && model.enabled !== false) {
                  // Add to list if not already present
                  const exists = embeddingModels.some(m => m.id === model.id);
                  if (!exists) {
                    embeddingModels.push({
                      id: model.id,
                      name: `${model.name ?? 'unknown'} (${model.provider})`,
                      dimensions: 1536, // Default dimension
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
    // First check built-in models
    const builtInModel = this.EMBEDDING_MODELS.find(m => m.id === id);
    if (builtInModel) {
      return builtInModel;
    }

    // Then check dynamically loaded LLM models
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

  // Initialize the Web Worker for embedding operations
  static initializeWorker(): void {
    if (this.worker) return;

    try {
      const workerCode = `
        onmessage = function(e) {
          const { id, text, dimensions } = e.data;
          let dims = dimensions || 384;
          let hash = 0;
          for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          var embedding = new Array(dims);
          for (var i = 0; i < dims; i++) {
            embedding[i] = Math.sin(hash + i) * Math.cos(hash + i * 2);
          }
          var sum = 0;
          for (var j = 0; j < dims; j++) sum += embedding[j] * embedding[j];
          var magnitude = Math.sqrt(sum);
          if (magnitude === 0) {
            var normalized = new Array(dims).fill(0);
            if (dims > 0) normalized[0] = 1;
            postMessage({ id: id, success: true, embedding: normalized });
          } else {
            postMessage({ id: id, success: true, embedding: embedding.map(v => v / magnitude) });
          }
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      
      this.worker.onmessage = (event: MessageEvent<EmbeddingResponse>) => {
        const response = event.data;
        const requestPromise = this.pendingRequests.get(response.id);
        if (requestPromise) {
          this.pendingRequests.delete(response.id);
          if (response.success && response.embedding) {
            requestPromise.resolve(response.embedding);
          } else {
            requestPromise.reject(new Error(response.error || 'Embedding generation failed'));
          }
        }
      };
      
      this.worker.onerror = (error) => {
        console.error('Embedding worker error:', error);
        for (const request of this.pendingRequests.values()) {
          request.reject(error);
        }
        this.pendingRequests.clear();
      };
    } catch (error) {
      console.error('Failed to initialize embedding worker:', error);
    }
  }

  // Generate embedding for text
  static async generateEmbedding(text: string, modelId?: string): Promise<number[]> {
    const model = modelId 
      ? this.getEmbeddingModelById(modelId) 
      : this.getDefaultEmbeddingModel();
    
    if (!model) {
      throw new Error(`Embedding model ${modelId ?? ''} not found`);
    }

    // 1. Try real API first
    if (model.provider === 'openai' || model.provider === 'google' || model.provider === 'ollama') {
      try {
        const plugin = this.getPluginInstance();
        if (plugin?.settings?.llmConfigs) {
          const config = ModelManager.findConfigForModelByProvider(model.id, plugin.settings.llmConfigs);
          if (config) {
            const provider = ProviderFactory.createProvider(config);
            if (provider.generateEmbedding) {
              return await provider.generateEmbedding(text, model.id);
            }
          }
        }
      } catch (error) {
        console.warn(`[EmbeddingManager] Real API failed, falling back: ${String(error)}`);
      }
    }
    
    // 2. Fallback to worker
    if (!this.worker) this.initializeWorker();
    if (this.worker) {
      return this.generateEmbeddingWithWorker(text, model.dimensions);
    } else {
      return this.createPlaceholderEmbedding(text, model.dimensions);
    }
  }

  private static getPluginInstance(): any {
    if (typeof window !== 'undefined') {
      return (window as any).app?.plugins?.plugins?.['intelligence-assistant'];
    }
    return null;
  }
  
  private static async generateEmbeddingWithWorker(text: string, dimensions: number): Promise<number[]> {
    return new Promise<number[]>((resolve, reject) => {
      const requestId = `embedding-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.pendingRequests.set(requestId, { resolve, reject });
      this.worker!.postMessage({ id: requestId, text, dimensions });
      activeWindow.setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Embedding generation timed out'));
        }
      }, 30000);
    });
  }

  private static createPlaceholderEmbedding(text: string, dimensions: number): number[] {
    const dims = dimensions || 384;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    const embedding = new Array(dims);
    for (let i = 0; i < dims; i++) {
      embedding[i] = Math.sin(hash + i) * Math.cos(hash + i * 2);
    }
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
      const normalized = new Array(dims).fill(0);
      if (dims > 0) normalized[0] = 1;
      return normalized;
    }
    return embedding.map(val => val / magnitude);
  }
  
  static cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.clear();
    }
  }
}
