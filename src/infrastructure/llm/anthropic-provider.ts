import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse, Message } from './types';

export class AnthropicProvider extends BaseStreamingProvider {
	private _inputTokens = 0;

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
			messages: nonSystemMessages.map(m => {
				if (m.role !== 'user' || !m.attachments?.some(a => a.type === 'image')) {
					return { role: m.role, content: m.content };
				}

				const content: any[] = [{ type: 'text', text: m.content }];
				for (const att of m.attachments) {
					if (att.type === 'image' && att.content) {
						// att.content is "data:image/png;base64,..."
						const match = att.content.match(/^data:([^;]+);base64,(.+)$/);
						if (match) {
							content.push({
								type: 'image',
								source: {
									type: 'base64',
									media_type: match[1],
									data: match[2],
								},
							});
						}
					}
				}
				return { role: m.role, content };
			}),
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

		let systemPrompt = system;
		if (request.responseFormat?.type === 'json_object') {
			systemPrompt = [systemPrompt, 'Respond with a valid JSON object only. Do not include markdown fences or explanatory text.']
				.filter(Boolean)
				.join('\n\n');
		} else if (request.responseFormat?.type === 'json_schema' && request.responseFormat.json_schema) {
			systemPrompt = [
				systemPrompt,
				'Respond with valid JSON only. Do not include markdown fences or explanatory text.',
				`JSON schema: ${JSON.stringify(request.responseFormat.json_schema.schema)}`,
			].filter(Boolean).join('\n\n');
		}

		if (systemPrompt) {
			body.system = systemPrompt;
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

		let systemPrompt = system;
		if (request.responseFormat?.type === 'json_object') {
			systemPrompt = [systemPrompt, 'Respond with a valid JSON object only. Do not include markdown fences or explanatory text.']
				.filter(Boolean)
				.join('\n\n');
		} else if (request.responseFormat?.type === 'json_schema' && request.responseFormat.json_schema) {
			systemPrompt = [
				systemPrompt,
				'Respond with valid JSON only. Do not include markdown fences or explanatory text.',
				`JSON schema: ${JSON.stringify(request.responseFormat.json_schema.schema)}`,
			].filter(Boolean).join('\n\n');
		}

		if (systemPrompt) {
			body.system = systemPrompt;
		}

		return { url, body };
	}

	protected parseStreamChunk(data: unknown): ParsedStreamChunk | null {
		const hasType = (obj: unknown): obj is { type: string } => {
			return typeof obj === 'object' && obj !== null && 'type' in obj;
		};

		if (!hasType(data)) return null;

		// Capture input tokens from message_start
		if (data.type === 'message_start') {
			const d = data as { message?: { usage?: { input_tokens?: number } } };
			this._inputTokens = d.message?.usage?.input_tokens ?? 0;
			return null;
		}

		// Extract finalized output tokens from message_delta
		if (data.type === 'message_delta') {
			const d = data as { usage?: { output_tokens?: number } };
			const outputTokens = d.usage?.output_tokens ?? 0;
			return {
				content: null,
				done: false,
				usage: {
					promptTokens: this._inputTokens,
					completionTokens: outputTokens,
					totalTokens: this._inputTokens + outputTokens,
				},
			};
		}

		// message_stop signals end of stream (usage already emitted in message_delta)
		if (data.type === 'message_stop') {
			return { content: null, done: true };
		}

		// Extract text content from content_block_delta
		if (data.type === 'content_block_delta') {
			const delta = (data as { delta?: { text?: string } }).delta;
			const content = delta?.text;
			if (content) return { content, done: false };
		}

		return null;
	}
}
