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
			'Authorization': `Bearer ${this.config.apiKey}`,
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

		const response = await this.makeRequest(url, body);
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

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: any } {
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

	protected parseStreamChunk(data: any): ParsedStreamChunk | null {
		// Same format as OpenAI
		if (data === '[DONE]') {
			return { content: null, done: true };
		}

		const content = data.choices?.[0]?.delta?.content;
		if (content) {
			return { content, done: false };
		}

		return null;
	}
}
