// Test utilities as specified in architecture
import { Vault } from 'obsidian';
import type { ILLMProvider } from '../infrastructure/llm/base-provider.interface';

export class TestUtils {
  static createMockVault(): Vault {
    return {
      adapter: {
        read: async () => '{}',
        write: async () => Promise.resolve(),
        exists: async () => true,
        remove: async () => Promise.resolve(),
        list: async () => ({ files: [], folders: [] }),
        getName: () => 'mock-adapter',
      } as any
    } as Vault;
  }

  static createMockProvider(): ILLMProvider {
    return {
      name: 'Mock Provider',
		version: '0.0.1',
      capabilities: {
        chat: true,
        embeddings: false,
        streaming: true,
        functions: false,
        models: true
      },
      models: [],
      isInitialized: true,
      initialize: async () => Promise.resolve(),
      chatCompletion: async () => ({
        content: { text: 'Mock response' },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'mock-model',
        createdAt: new Date()
      }),
      chatCompletionStream: async (messages, options, onChunk) => {
        onChunk({ content: 'Mock stream chunk', index: 0, isFinished: true });
        return {
          content: { text: 'Mock stream response' },
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          model: 'mock-model',
          createdAt: new Date()
        };
      },
      generateEmbedding: async () => ({
        embeddings: [[0.1, 0.2, 0.3]],
        model: 'mock-embedding-model',
        usage: { promptTokens: 10, totalTokens: 10 }
      }),
      countTokens: async () => ({ count: 10, model: 'mock-model' }),
      validateConfig: () => ({ success: true, errors: [] }),
      testConnection: async () => ({ success: true, message: 'Connected' }),
      cleanup: async () => Promise.resolve()
    } as ILLMProvider;
  }
}
