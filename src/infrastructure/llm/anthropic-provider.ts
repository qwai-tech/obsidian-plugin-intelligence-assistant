import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse, Message } from './types';

export class AnthropicProvider extends BaseStreamingProvider {
	get name(): string {
		return 'Anthropic';
	}

	protected getProviderName(): string {
		return 'Anthropic';
	}

	protected getHeaders(): Record<string, string> {
		if (!this.config.apiKey) {
			throw new Error('Anthropic API key is required');
		}

		return {
			...super.getHeaders(),
			'x-api-key': this.config.apiKey,
			'anthropic-version': '2023-06-01',
		};
	}

	private convertMessages(messages: Message[]): { system?: string; messages: unknown[] } {
		const systemMessage = messages.find(m => m.role === 'system');
		const nonSystemMessages = messages.filter(m => m.role !== 'system');

		return {
			system: systemMessage?.content,
			messages: nonSystemMessages.map(m => ({
				role: m.role,
				content: m.content,
			})),
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = this.getBaseUrl('https://api.anthropic.com/v1') + '/messages';

		const { system, messages } = this.convertMessages(request.messages);
		const modelName = this.extractModelName(request.model);

		const body: Record<string, unknown> = {
			model: modelName,
			messages,
			max_tokens: request.maxTokens ?? 4096,
			temperature: request.temperature ?? 0.7,
			stream: false,
		};

		if (system) {
			body.system = system;
		}

		const response = await this.makeRequest(url, body) as { json: {
			content: Array<{ text: string }>;
			usage: { input_tokens: number; output_tokens: number };
		}};
		const data = response.json;

		return {
			content: data.content[0].text,
			usage: {
				promptTokens: data.usage.input_tokens,
				completionTokens: data.usage.output_tokens,
				totalTokens: data.usage.input_tokens + data.usage.output_tokens,
			},
		};
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		const url = this.getBaseUrl('https://api.anthropic.com/v1') + '/messages';

		const { system, messages } = this.convertMessages(request.messages);
		const modelName = this.extractModelName(request.model);

		const body: Record<string, unknown> = {
			model: modelName,
			messages,
			max_tokens: request.maxTokens ?? 4096,
			temperature: request.temperature ?? 0.7,
			stream: true,
		};

		if (system) {
			body.system = system;
		}

		return { url, body };
	}

	protected parseStreamChunk(data: unknown): ParsedStreamChunk | null {
		// Type guard for data structure
		const hasType = (obj: unknown): obj is { type: string } => {
			return typeof obj === 'object' && obj !== null && 'type' in obj;
		};

		if (!hasType(data)) {
			return null;
		}

		// Check if stream is complete
		if (data.type === 'message_stop') {
			return { content: null, done: true };
		}

		// Extract content from Anthropic's structure
		if (data.type === 'content_block_delta') {
			const delta = (data as { delta?: { text?: string } }).delta;
			const content = delta?.text;
			if (content) {
				return { content, done: false };
			}
		}

		// Ignore other event types
		return null;
	}
}
