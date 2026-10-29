import { OpenAICompatibleProvider } from './openai-compatible-provider';

export class OpenRouterProvider extends OpenAICompatibleProvider {
	protected readonly defaultBaseUrl = 'https://openrouter.ai/api/v1';
	protected readonly includeStreamUsage = false;

	get name(): string {
		return 'OpenRouter';
	}

	protected getHeaders(): Record<string, string> {
		return {
			...super.getHeaders(),
			'HTTP-Referer': 'https://obsidian.md',
			'X-Title': 'Obsidian Intelligence Assistant',
		};
	}
}
