import type { HttpPort } from './http';
import type { ILLMProvider, LLMConfig, ModelInfo } from './types';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { GoogleProvider } from './providers/google-provider';
import { DeepSeekProvider } from './providers/deepseek-provider';
import { OpenRouterProvider } from './providers/openrouter-provider';
import { OllamaProvider } from './providers/ollama-provider';
import { SAPAICoreProvider } from './providers/sap-ai-core-provider';
import { fetchAnthropicModels, fetchDeepSeekModels, fetchGoogleModels, fetchOpenAIModels, fetchOpenRouterModels } from './model-fetchers';

interface ProviderDefinition {
	readonly id: string;
	readonly label: string;
	readonly labelKey: string;
	readonly credential: 'api-key' | 'service-key' | 'optional';
	create(config: LLMConfig, http: HttpPort): ILLMProvider;
	discover(config: LLMConfig): Promise<ModelInfo[]>;
}
/** One registry owns protocol construction and discovery; UI presentation remains separate. */
export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = Object.freeze([
	{ id: 'openai', labelKey: 'modals.provider.providers.openai', label: 'OpenAI', credential: 'api-key', create: (c: LLMConfig, h: HttpPort) => new OpenAIProvider(c, h), discover: (c: LLMConfig) => fetchOpenAIModels(c.apiKey ?? '', c.baseUrl) },
	{ id: 'anthropic', labelKey: 'modals.provider.providers.anthropic', label: 'Anthropic', credential: 'api-key', create: (c: LLMConfig, h: HttpPort) => new AnthropicProvider(c, h), discover: (c: LLMConfig) => fetchAnthropicModels(c.apiKey ?? '', c.baseUrl) },
	{ id: 'google', labelKey: 'modals.provider.providers.google', label: 'Google (Gemini)', credential: 'api-key', create: (c: LLMConfig, h: HttpPort) => new GoogleProvider(c, h), discover: (c: LLMConfig) => fetchGoogleModels(c.apiKey ?? '', c.baseUrl) },
	{ id: 'deepseek', labelKey: 'modals.provider.providers.deepseek', label: 'DeepSeek', credential: 'api-key', create: (c: LLMConfig, h: HttpPort) => new DeepSeekProvider(c, h), discover: (c: LLMConfig) => fetchDeepSeekModels(c.apiKey ?? '', c.baseUrl) },
	{ id: 'ollama', labelKey: 'modals.provider.providers.ollama', label: 'Ollama', credential: 'optional', create: (c: LLMConfig, h: HttpPort) => new OllamaProvider(c, h), discover: (c: LLMConfig) => new OllamaProvider(c).fetchModels() },
	{ id: 'openrouter', labelKey: 'modals.provider.providers.openrouter', label: 'OpenRouter', credential: 'api-key', create: (c: LLMConfig, h: HttpPort) => new OpenRouterProvider(c, h), discover: (c: LLMConfig) => fetchOpenRouterModels(c.apiKey ?? '', c.baseUrl) },
	{ id: 'sap-ai-core', labelKey: 'modals.provider.providers.sapAiCore', label: 'SAP AI Core', credential: 'service-key', create: (c: LLMConfig, h: HttpPort) => new SAPAICoreProvider(c, h), discover: (c: LLMConfig) => new SAPAICoreProvider(c).fetchModels() },
	{ id: 'custom', labelKey: 'modals.provider.providers.custom', label: 'Custom', credential: 'optional', create: (c: LLMConfig, h: HttpPort) => new OpenAIProvider(c, h), discover: (c: LLMConfig) => fetchOpenAIModels(c.apiKey ?? '', c.baseUrl, 'custom') },
].map(definition => Object.freeze(definition)) as ProviderDefinition[]);
export function providerDefinition(id: string): ProviderDefinition {
	const definition = PROVIDER_DEFINITIONS.find(item => item.id === id);
	if (!definition) throw new Error(`Unknown provider: ${id}`);
	return definition;
}
