import { ILLMProvider } from './types';
import type { LLMConfig } from './types';
import { type HttpPort, getDefaultHttpPort } from './http';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { GoogleProvider } from './providers/google-provider';
import { DeepSeekProvider } from './providers/deepseek-provider';
import { OpenRouterProvider } from './providers/openrouter-provider';
import { SAPAICoreProvider } from './providers/sap-ai-core-provider';
import { OllamaProvider } from './providers/ollama-provider';

export class ProviderFactory {
	/**
	 * @param config Endpoint and credentials for the provider.
	 * @param http Transport to use. Defaults to the port registered via
	 *   `setDefaultHttpPort`, which is what production call sites rely on; pass one
	 *   explicitly in tests to keep them off the network.
	 */
	static createProvider(config: LLMConfig, http: HttpPort = getDefaultHttpPort()): ILLMProvider {
		switch (config.provider) {
			case 'openai':
				return new OpenAIProvider(config, http);
			case 'anthropic':
				return new AnthropicProvider(config, http);
			case 'google':
				return new GoogleProvider(config, http);
			case 'deepseek':
				return new DeepSeekProvider(config, http);
			case 'openrouter':
				return new OpenRouterProvider(config, http);
			case 'sap-ai-core':
				return new SAPAICoreProvider(config, http);
			case 'ollama':
				return new OllamaProvider(config, http);
			case 'custom':
				// Custom provider uses OpenAI-compatible API
				return new OpenAIProvider(config, http);
			default:
				throw new Error(`Unknown provider: ${config.provider}`);
		}
	}
}
