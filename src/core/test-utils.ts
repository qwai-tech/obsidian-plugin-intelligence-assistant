// Test utilities as specified in architecture
import { Vault } from 'obsidian';
import type { ILLMProvider } from '../infrastructure/llm/base-provider.interface';

export class TestUtils {
  static createMockVault(): Vault {
    return {
      adapter: {
        read: () => Promise.resolve('{}'),
        write: () => Promise.resolve(),
        exists: () => Promise.resolve(true),
        remove: () => Promise.resolve(),
        list: () => Promise.resolve({ files: [], folders: [] }),
        getName: () => 'mock-adapter',
      } as unknown
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
      initialize: () => Promise.resolve(),
      chatCompletion: () => Promise.resolve({
        content: { text: 'Mock response' },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'mock-model',
        createdAt: new Date()
      }),
      chatCompletionStream: (messages, options, onChunk) => {
        onChunk({ content: 'Mock stream chunk', index: 0, isFinished: true });
        return Promise.resolve({
          content: { text: 'Mock stream response' },
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          model: 'mock-model',
          createdAt: new Date()
        });
      },
      generateEmbedding: () => Promise.resolve({
        embeddings: [[0.1, 0.2, 0.3]],
        model: 'mock-embedding-model',
        usage: { promptTokens: 10, totalTokens: 10 }
      }),
      countTokens: () => Promise.resolve({ count: 10, model: 'mock-model' }),
      validateConfig: () => ({ success: true, errors: [] }),
      testConnection: () => Promise.resolve({ success: true, message: 'connected' }),
      cleanup: () => Promise.resolve()
    } as ILLMProvider;
  }
}
