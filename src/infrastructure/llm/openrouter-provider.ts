import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse } from './types';

export class OpenRouterProvider extends BaseStreamingProvider {
	get name(): string {
		return 'OpenRouter';
	}

	protected getProviderName(): string {
		return 'OpenRouter';
	}

	protected getHeaders(): Record<string, string> {
		return {
			...super.getHeaders(),
			'Authorization': `Bearer ${this.config.apiKey ?? ''}`,
			'HTTP-Referer': 'https://obsidian.md',
			'X-Title': 'Obsidian Intelligence Assistant',
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = this.getBaseUrl('https://openrouter.ai/api/v1') + '/chat/completions';
		const modelName = this.extractModelName(request.model);

		const body = {
			model: modelName,
			messages: request.messages,
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 2000,
			stream: false,
		};

		const response = await this.makeRequest(url, body) as {
			json: {
				choices: Array<{ message: { content: string } }>;
				usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
			}
		};
		const data = response.json;

		return {
			content: data.choices[0].message.content,
			usage: {
				promptTokens: data.usage?.prompt_tokens || 0,
				completionTokens: data.usage?.completion_tokens || 0,
				totalTokens: data.usage?.total_tokens || 0,
			},
		};
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		const url = this.getBaseUrl('https://openrouter.ai/api/v1') + '/chat/completions';
		const modelName = this.extractModelName(request.model);

		const body = {
			model: modelName,
			messages: request.messages,
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 2000,
			stream: true,
		};

		return { url, body };
	}

	protected parseStreamChunk(data: unknown): ParsedStreamChunk | null {
		// Same format as OpenAI
		if (data === '[DONE]') {
			return { content: null, done: true };
		}

		// Type guard for OpenRouter's data structure (OpenAI-compatible)
		const hasChoices = (obj: unknown): obj is {
			choices?: Array<{ delta?: { content?: string } }>;
		} => {
			return typeof obj === 'object' && obj !== null && 'choices' in obj;
		};

		if (!hasChoices(data)) {
			return null;
		}

		const content = data.choices?.[0]?.delta?.content;
		if (content) {
			return { content, done: false };
		}

		return null;
	}
}
