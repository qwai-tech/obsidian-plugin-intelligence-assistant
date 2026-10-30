/**
 * @qwai/obsidian-llm -- multi-provider LLM client for Obsidian plugins.
 *
 * Two independent things live here, and they solve different problems:
 *
 * 1. The provider layer (`ProviderFactory`, `ModelManager`, the providers). Any
 *    plugin can bundle this instead of writing its own OpenAI/Anthropic/Google/
 *    Ollama clients, SSE parsing, and CORS fallback.
 * 2. The hub contract (`hub.ts`). Bundling code does not stop a user from having
 *    to enter the same API key in every plugin; that needs one plugin to own the
 *    configuration and lend it out at runtime.
 *
 * Hosts must register a transport once at startup:
 *
 * ```ts
 * import { setDefaultHttpPort, createObsidianHttpPort } from '@qwai/obsidian-llm';
 * setDefaultHttpPort(createObsidianHttpPort());
 * ```
 */

export type { ChatRequest, ChatResponse, ConnectionTest, ILLMProvider, LLMAttachment, LLMConfig, LLMMessage, LLMProviderConfig, ModelCapability, ModelConfig, ModelInfo, ProviderCapabilities, StreamChunk, TokenCount, TokenUsage, ValidationResult } from './types';
export { StreamTransportUnavailableError, createFetchHttpPort, getDefaultHttpPort, resetDefaultHttpPort, setDefaultHttpPort } from './http';
export type { HttpPort, HttpRequest, HttpResponse, StreamResponse } from './http';
export { createObsidianHttpPort } from './obsidian-http';
export { reportDiagnostic, resetDiagnosticsSink, setDiagnosticsSink } from './diagnostics';
export type { DiagnosticsSink, LLMDiagnostic } from './diagnostics';
export { LLM_HUB_API_VERSION, LLM_HUB_PROPERTY, describeResolveFailure, resolveLLM } from './hub';
export type { LLMHub, ResolveLLMFailure, ResolveLLMResult } from './hub';
export { BaseLLMProvider } from './base-provider';
export { BaseStreamingProvider } from './base-streaming-provider';
export type { ChunkParser, ParsedStreamChunk } from './base-streaming-provider';
export { toOpenAiWireMessage, toOpenAiWireMessages } from './openai-message';
export type { OpenAiWireMessage } from './openai-message';
export { ModelManager } from './model-manager';
export { ProviderFactory } from './provider-factory';
export { OpenAIProvider } from './providers/openai-provider';
export { AnthropicProvider } from './providers/anthropic-provider';
export { GoogleProvider } from './providers/google-provider';
export { DeepSeekProvider } from './providers/deepseek-provider';
export { OpenRouterProvider } from './providers/openrouter-provider';
export { OllamaProvider } from './providers/ollama-provider';
export { HttpAbortedError, HttpTimeoutError, withResilience } from './resilient-http';
export type { ResilienceOptions } from './resilient-http';
