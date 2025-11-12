import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse, Message } from './types';

export class GoogleProvider extends BaseStreamingProvider {
	get name(): string {
		return 'Google (Gemini)';
	}

	protected getProviderName(): string {
		return 'Google';
	}

	protected getHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
		};
	}

	private transformMessages(messages: Message[]): any {
		// Gemini uses a "contents" array with role "user" or "model"
		return messages.map(msg => ({
			role: msg.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: msg.content }]
		}));
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const baseUrl = this.getBaseUrl('https://generativelanguage.googleapis.com/v1beta');
		const model = this.extractModelName(request.model);
		const url = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;

		const body = {
			contents: this.transformMessages(request.messages),
			generationConfig: {
				temperature: request.temperature ?? 0.7,
				maxOutputTokens: request.maxTokens ?? 2000,
			}
		};

		const response = await this.makeRequest(url, body);
		const data = response.json;

		const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

		return {
			content,
			usage: {
				promptTokens: data.usageMetadata?.promptTokenCount || 0,
				completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
				totalTokens: data.usageMetadata?.totalTokenCount || 0,
			},
		};
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: any } {
		const baseUrl = this.getBaseUrl('https://generativelanguage.googleapis.com/v1beta');
		const model = this.extractModelName(request.model);
		const url = `${baseUrl}/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

		const body = {
			contents: this.transformMessages(request.messages),
			generationConfig: {
				temperature: request.temperature ?? 0.7,
				maxOutputTokens: request.maxTokens ?? 2000,
			}
		};

		return { url, body };
	}

	protected parseStreamChunk(data: any): ParsedStreamChunk | null {
		// Extract content from Google's structure
		const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (content) {
			return { content, done: false };
		}

		// No content to process
		return null;
	}
}
