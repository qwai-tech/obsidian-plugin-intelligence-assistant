import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse } from './types';

export class DeepSeekProvider extends BaseStreamingProvider {
	get name(): string {
		return 'DeepSeek';
	}

	protected getProviderName(): string {
		return 'DeepSeek';
	}

	protected getHeaders(): Record<string, string> {
		return {
			...super.getHeaders(),
			'Authorization': `Bearer ${this.config.apiKey}`,
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = this.getBaseUrl('https://api.deepseek.com/v1') + '/chat/completions';
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
				promptTokens: data.usage.prompt_tokens,
				completionTokens: data.usage.completion_tokens,
				totalTokens: data.usage.total_tokens,
			},
		};
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: any } {
		const url = this.getBaseUrl('https://api.deepseek.com/v1') + '/chat/completions';
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
		if (data === '[DONE]') {
			return { content: null, done: true };
		}

		const delta = data.choices?.[0]?.delta;

		// DeepSeek R1 models return reasoning_content
		const reasoning = delta?.reasoning_content;
		const content = delta?.content;

		// Send chunk if there's any content (reasoning or actual response)
		if (reasoning || content) {
			return {
				content: content || '',
				done: false,
				// Note: reasoning is provider-specific, would need type extension
				// For now, we'll just send content
			};
		}

		return null;
	}
}
