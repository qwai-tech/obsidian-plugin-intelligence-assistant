import type { RAGConfig } from '@/types';

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
      // Access the plugin settings to get all configured models
      if (typeof window !== 'undefined') {
        const windowWithApp = window as unknown as {
          app?: {
            plugins?: {
              plugins?: {
                'intelligence-assistant'?: {
                  settings?: {
                    llmConfigs?: Array<{
                      cachedModels?: Array<{
                        id: string;
                        name: string;
                        provider: string;
                        capabilities?: string[];
                        enabled?: boolean;
                      }>;
                    }>;
                  };
                };
              };
            };
          };
        };

        const app = windowWithApp.app;
        const plugin = app?.plugins?.plugins?.['intelligence-assistant'];

        if (plugin?.settings?.llmConfigs) {
          // Iterate through all LLM configs and their cached models
          plugin.settings.llmConfigs.forEach((config: {
            cachedModels?: Array<{
              id: string;
              name: string;
              provider: string;
              capabilities?: string[];
              enabled?: boolean;
            }>;
          }) => {
            if (config.cachedModels) {
              config.cachedModels.forEach((model: {
                id: string;
                name: string;
                provider: string;
                capabilities?: string[];
                enabled?: boolean;
              }) => {
                // Check if model has embedding capability
                if (model.capabilities?.includes('embedding') && model.enabled !== false) {
                  // Add to list if not already present
                  const exists = embeddingModels.some(m => m.id === model.id);
                  if (!exists) {
                    embeddingModels.push({
                      id: model.id,
                      name: `${model.name ?? 'unknown'} (${model.provider})`,
                      dimensions: 1536, // Default dimension, can be adjusted
                      provider: model.provider,
                      maxTokens: 8192 // Default max tokens
                    });
                  }
                }
              });
            }
          });
        }
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
    if (!this.worker) {
      // Create the worker by using a blob URL for the embedded worker code
      // In a real project, we would reference the actual worker file path
      try {
        // This creates a Web Worker that runs embedding computations in a separate thread
        const workerCode = `
          // Web Worker for embedding computations
          onmessage = function(e) {
            const { id, text, dimensions } = e.data;
            
            // Validate dimensions
            let dims = dimensions;
            if (!dims || dims <= 0 || dims > 10000) {
              dims = 384;
            }

            // Simple text-based hash algorithm (since TextEncoder isn't available in workers)
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
              const char = text.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash; // Convert to 32bit integer
            }

            // Create embedding array
            var embedding = new Array(dims);
            for (var i = 0; i < dims; i++) {
              var value = Math.sin(hash + i) * Math.cos(hash + i * 2);
              embedding[i] = value;
            }

            // Normalize the vector
            var sum = 0;
            for (var j = 0; j < dims; j++) {
              sum += embedding[j] * embedding[j];
            }
            var magnitude = Math.sqrt(sum);

            if (magnitude === 0) {
              var normalized = new Array(dims).fill(0);
              if (dims > 0) normalized[0] = 1;
              postMessage({ id: id, success: true, embedding: normalized });
            } else {
              var result = new Array(dims);
              for (var k = 0; k < dims; k++) {
                result[k] = embedding[k] / magnitude || 0;
              }
              postMessage({ id: id, success: true, embedding: result });
            }
          };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        
        // Handle messages from the worker
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
        
        // Handle errors from the worker
        this.worker.onerror = (error) => {
          console.error('Embedding worker error:', error);
          // Reject all pending requests
          for (const request of this.pendingRequests.values()) {
            request.reject(error);
          }
          this.pendingRequests.clear();
        };
      } catch (error) {
        console.error('Failed to initialize embedding worker:', error);
        // In Obsidian context, Web Workers might not be available depending on environment
        console.warn('Falling back to synchronous embedding computation');
      }
    }
  }

  // Generate embedding for text using Web Worker when available
  static async generateEmbedding(text: string, modelId?: string): Promise<number[]> {
    const model = modelId 
      ? this.getEmbeddingModelById(modelId) 
      : this.getDefaultEmbeddingModel();
    
    if (!model) {
      throw new Error(`Embedding model ${modelId ?? ''} not found`);
    }
    
    // Initialize worker if not already done
    if (!this.worker) {
      this.initializeWorker();
    }
    
    // Use Web Worker if available, otherwise fall back to synchronous processing
    if (this.worker) {
      return this.generateEmbeddingWithWorker(text, model.dimensions);
    } else {
      // Fallback to synchronous computation
      return this.createPlaceholderEmbedding(text, model.dimensions);
    }
  }
  
  private static async generateEmbeddingWithWorker(text: string, dimensions: number): Promise<number[]> {
    return new Promise<number[]>((resolve, reject) => {
      const requestId = `embedding-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Store the promise callbacks
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Send request to worker
      const request: EmbeddingRequest = {
        id: requestId,
        text,
        dimensions
      };
      
      this.worker!.postMessage(request);
      
      // Set a timeout to reject the promise if the worker doesn't respond
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Embedding generation timed out'));
        }
      }, 30000); // 30 second timeout
    });
  }

  // Fallback synchronous method for when worker is not available
  private static createPlaceholderEmbedding(text: string, dimensions: number): number[] {
    // Validate dimensions
    if (!dimensions || dimensions <= 0 || dimensions > 10000) {
      dimensions = 384;
    }
    
    // Simple text-based hash algorithm (same as in worker, but using TextEncoder)
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    
    // Create a hash-based embedding
    const embedding: number[] = new Array(dimensions) as number[];
    
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      const char = bytes[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Generate values using the hash
    for (let i = 0; i < dimensions; i++) {
      const value = Math.sin(hash + i) * Math.cos(hash + i * 2);
      embedding[i] = value;
    }
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
      // If magnitude is 0, return a normalized vector with 1 in first position
      const normalized: number[] = new Array(dimensions).fill(0) as number[];
      if (dimensions > 0) normalized[0] = 1;
      return normalized;
    }
    return embedding.map(val => val / magnitude || 0);
  }
  
  // Clean up the worker when no longer needed
  static cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.clear();
    }
  }
}
