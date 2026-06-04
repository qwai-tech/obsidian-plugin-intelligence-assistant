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

	private transformMessages(messages: Message[]): unknown {
		// Gemini uses a "contents" array with role "user" or "model"
		return messages.map(msg => {
			const role = msg.role === 'assistant' ? 'model' : 'user';
			
			if (msg.role !== 'user' || !msg.attachments?.some(a => a.type === 'image')) {
				return { role, parts: [{ text: msg.content }] };
			}

			const parts: any[] = [{ text: msg.content }];
			for (const att of msg.attachments) {
				if (att.type === 'image' && att.content) {
					// att.content is "data:image/png;base64,..."
					const match = att.content.match(/^data:([^;]+);base64,(.+)$/);
					if (match) {
						parts.push({
							inline_data: {
								mime_type: match[1],
								data: match[2],
							},
						});
					}
				}
			}
			return { role, parts };
		});
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const baseUrl = this.getBaseUrl('https://generativelanguage.googleapis.com/v1beta');
		const model = this.extractModelName(request.model);
		const url = `${baseUrl ?? ''}/models/${model ?? ''}:generateContent?key=${this.config.apiKey ?? ''}`;

		const generationConfig: Record<string, unknown> = {
			temperature: request.temperature ?? 0.7,
			maxOutputTokens: request.maxTokens ?? 2000,
		};
		if (request.responseFormat?.type === 'json_object') {
			generationConfig.responseMimeType = 'application/json';
		} else if (request.responseFormat?.type === 'json_schema' && request.responseFormat.json_schema) {
			generationConfig.responseMimeType = 'application/json';
			generationConfig.responseSchema = request.responseFormat.json_schema.schema;
		}

		const body = {
			contents: this.transformMessages(request.messages),
			generationConfig
		};

		const response = await this.makeRequest(url, body) as {
			json: {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
				usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
			}
		};
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

	async generateEmbedding(text: string, model: string): Promise<number[]> {
		const baseUrl = this.getBaseUrl('https://generativelanguage.googleapis.com/v1beta');
		const modelName = this.extractModelName(model);
		const url = `${baseUrl ?? ''}/models/${modelName ?? ''}:embedContent?key=${this.config.apiKey ?? ''}`;

		const body = {
			model: `models/${modelName}`,
			content: {
				parts: [{ text }]
			}
		};

		const response = await this.makeRequest(url, body) as {
			json: {
				embedding: { values: number[] };
			}
		};
		return response.json.embedding.values;
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		const baseUrl = this.getBaseUrl('https://generativelanguage.googleapis.com/v1beta');
		const model = this.extractModelName(request.model);
		const url = `${baseUrl ?? ''}/models/${model ?? ''}:streamGenerateContent?key=${this.config.apiKey ?? ''}&alt=sse`;

		const generationConfig: Record<string, unknown> = {
			temperature: request.temperature ?? 0.7,
			maxOutputTokens: request.maxTokens ?? 2000,
		};
		if (request.responseFormat?.type === 'json_object') {
			generationConfig.responseMimeType = 'application/json';
		} else if (request.responseFormat?.type === 'json_schema' && request.responseFormat.json_schema) {
			generationConfig.responseMimeType = 'application/json';
			generationConfig.responseSchema = request.responseFormat.json_schema.schema;
		}

		const body = {
			contents: this.transformMessages(request.messages),
			generationConfig
		};

		return { url, body };
	}

	protected parseStreamChunk(data: unknown): ParsedStreamChunk | null {
		// Type guard for Google's data structure
		const hasCandidates = (obj: unknown): obj is {
			candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		} => {
			return typeof obj === 'object' && obj !== null && 'candidates' in obj;
		};

		if (!hasCandidates(data)) {
			return null;
		}

		// Extract usage metadata from Google's structure
		const gdata = data as Record<string, unknown>;
		const usageMeta = gdata.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
		const usage = usageMeta ? {
			promptTokens: usageMeta.promptTokenCount ?? 0,
			completionTokens: usageMeta.candidatesTokenCount ?? 0,
			totalTokens: usageMeta.totalTokenCount ?? 0,
		} : undefined;

		// Extract content from Google's structure
		const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (content) {
			return { content, done: false, usage };
		}
		if (usage) {
			return { content: null, done: false, usage };
		}

		return null;
	}
}
