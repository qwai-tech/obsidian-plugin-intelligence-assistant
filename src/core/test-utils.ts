// Test utilities as specified in architecture
import { Vault } from 'obsidian';
import type { ILLMProvider, ChatRequest, ChatResponse, StreamChunk } from '@/types/common/llm';

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
      chat: (_request: ChatRequest) => Promise.resolve({
        content: 'Mock response',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      } as ChatResponse),
      streamChat: (_request: ChatRequest, onChunk: (_chunk: StreamChunk) => void) => {
        onChunk({ content: 'Mock stream chunk', done: true });
        return Promise.resolve();
      },
      generateEmbedding: () => Promise.resolve([0.1, 0.2, 0.3]),
      countTokens: () => Promise.resolve({ count: 10, model: 'mock-model' }),
      validateConfig: () => ({ success: true, errors: [] }),
      testConnection: () => Promise.resolve({ success: true, message: 'connected' }),
      cleanup: () => Promise.resolve()
    };
  }
}
