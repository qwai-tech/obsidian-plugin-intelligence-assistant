// Unified LLM provider interface as specified in architecture
export interface ILLMProvider {
  readonly name: string;
  readonly version: string;
  readonly capabilities: ProviderCapabilities;
  readonly models: ModelConfig[];
  readonly isInitialized: boolean;

  initialize(_config: LLMProviderConfig): Promise<void>;
  chatCompletion(_messages: LLMMessage[], _options: LLMRequestOptions): Promise<LLMResponse>;
  chatCompletionStream(_messages: LLMMessage[], _options: LLMRequestOptions, _onChunk: (_chunk: LLMStreamChunk) => void): Promise<LLMResponse>;
  generateEmbedding(_text: string | string[], _model?: string): Promise<EmbeddingResponse>;
  countTokens(_text: string, _model?: string): Promise<TokenCount>;
  validateConfig(_config: LLMProviderConfig): ValidationResult;
  testConnection(_config?: LLMProviderConfig): Promise<ConnectionTest>;
  cleanup(): Promise<void>;
}

// Provider capabilities
export interface ProviderCapabilities {
  chat: boolean;
  embeddings: boolean;
  streaming: boolean;
  functions: boolean;
  models: boolean;
}

// Model configuration
export interface ModelConfig {
  id: string;
  name: string;
  maxTokens: number;
  contextWindow: number;
  supportsFunctions: boolean;
  capabilities: string[];
}

// Configuration types
export interface LLMProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  [key: string]: unknown;
}

// Message types
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Request options
export interface LLMRequestOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  [key: string]: unknown;
}

// Response types
export interface LLMResponse {
  content: {
    text: string;
    toolCalls?: unknown[];
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  createdAt: Date;
}

// Stream chunk
export interface LLMStreamChunk {
  content: string;
  index: number;
  isFinished: boolean;
}

// Embedding response
export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// Token count
export interface TokenCount {
  count: number;
  model: string;
}

// Validation result
export interface ValidationResult {
  success: boolean;
  errors: string[];
}

// Connection test
export interface ConnectionTest {
  success: boolean;
  message: string;
  models?: string[];
}