import { ILLMProvider } from './types';
import type { LLMConfig } from '@/types';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GoogleProvider } from './google-provider';
import { DeepSeekProvider } from './deepseek-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { SAPAICoreProvider } from './sap-ai-core-provider';
import { OllamaProvider } from './ollama-provider';
import { CliProvider } from './cli-provider';

export class ProviderFactory {
	static createProvider(config: LLMConfig): ILLMProvider {
		switch (config.provider) {
			case 'openai':
				return new OpenAIProvider(config);
			case 'anthropic':
				return new AnthropicProvider(config);
			case 'google':
				return new GoogleProvider(config);
			case 'deepseek':
				return new DeepSeekProvider(config);
			case 'openrouter':
				return new OpenRouterProvider(config);
			case 'sap-ai-core':
				return new SAPAICoreProvider(config);
			case 'ollama':
				return new OllamaProvider(config);
			case 'claude-code':
				return new CliProvider(config, 'claude-code');
			case 'codex':
				return new CliProvider(config, 'codex');
			case 'qwen-code':
				return new CliProvider(config, 'qwen-code');
			case 'custom':
				// Custom provider uses OpenAI-compatible API
				return new OpenAIProvider(config);
			default:
				throw new Error(`Unknown provider: ${config.provider}`);
		}
	}
}
