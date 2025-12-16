import { ILLMProvider } from './types';
import type { LLMConfig } from '@/types';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GoogleProvider } from './google-provider';
import { DeepSeekProvider } from './deepseek-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { SAPAICoreProvider } from './sap-ai-core-provider';
import { OllamaProvider } from './ollama-provider';
import { CodexProvider } from './codex-provider';
import { QwenCodeProvider } from './qwen-code-provider';
import { ClaudeCodeProvider } from './claude-code-provider';

export class ProviderFactory {
	static createProvider(config: LLMConfig): ILLMProvider {
		switch (config.provider) {
			case 'openai':
				return new OpenAIProvider(config);
			case 'codex':
				return new CodexProvider(config);
			case 'anthropic':
				return new AnthropicProvider(config);
			case 'claude-code':
				return new ClaudeCodeProvider(config);
			case 'google':
				return new GoogleProvider(config);
			case 'deepseek':
				return new DeepSeekProvider(config);
			case 'qwen-code':
				return new QwenCodeProvider(config);
			case 'openrouter':
				return new OpenRouterProvider(config);
			case 'sap-ai-core':
				return new SAPAICoreProvider(config);
			case 'ollama':
				return new OllamaProvider(config);
			case 'custom':
				// Custom provider uses OpenAI-compatible API
				return new OpenAIProvider(config);
			default:
				throw new Error(`Unknown provider: ${config.provider}`);
		}
	}
}
