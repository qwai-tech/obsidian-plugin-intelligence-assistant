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

export * from './types';
export * from './http';
export * from './obsidian-http';
export * from './diagnostics';
export * from './hub';
export * from './base-provider';
export * from './base-streaming-provider';
export * from './openai-message';
export * from './model-manager';
export * from './provider-factory';
export * from './providers/openai-provider';
export * from './providers/anthropic-provider';
export * from './providers/google-provider';
export * from './providers/deepseek-provider';
export * from './providers/openrouter-provider';
export * from './providers/ollama-provider';
export * from './providers/sap-ai-core-provider';
export * from './resilient-http';
