import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse } from './types';

export class OpenAIProvider extends BaseStreamingProvider {
	private toolCallAccumulator: Map<number, { id: string; name: string; arguments: string }> = new Map();

	get name(): string {
		return 'OpenAI';
	}

	/**
	 * Base URL for OpenAI-compatible APIs.
	 * Subclasses can override to swap in other OpenAI-style endpoints.
	 */
	// biome-ignore lint/nursery/noMisusedGetSet: readability helper for subclasses
	protected get apiBase(): string {
		return this.getBaseUrl('https://api.openai.com/v1');
	}

	protected getProviderName(): string {
		return 'OpenAI';
	}

	protected getHeaders(): Record<string, string> {
		return {
			...super.getHeaders(),
			'Authorization': `Bearer ${this.config.apiKey ?? ''}`,
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = this.apiBase + '/chat/completions';

		const maxTokensValue = request.maxTokens ?? 2000;
		const modelName = this.extractModelName(request.model);

		// Phase D1: Multi-modal Support (Vision)
		const messages = request.messages.map(msg => {
			if (msg.role !== 'user' || !msg.attachments?.some(a => a.type === 'image')) {
				return msg;
			}
			const content: any[] = [{ type: 'text', text: msg.content }];
			for (const att of msg.attachments) {
				if (att.type === 'image' && att.content) {
					content.push({ type: 'image_url', image_url: { url: att.content } });
				}
			}
			return { ...msg, content };
		});

		const body: Record<string, unknown> = {
			model: modelName,
			messages,
			temperature: request.temperature ?? 0.7,
			stream: false,
		};

		if (request.responseFormat !== undefined) {
			body.response_format = request.responseFormat;
		}

		// Use max_completion_tokens for newer models (gpt-4o, gpt-4-turbo, etc.)
		// Use max_tokens for older models (gpt-4, gpt-3.5-turbo)
		if (this.shouldUseMaxCompletionTokens(modelName)) {
			body.max_completion_tokens = maxTokensValue;
		} else {
			body.max_tokens = maxTokensValue;
		}

		const response = await this.makeRequest(url, body) as {
			json: {
				choices: Array<{ message: { content: string } }>;
				usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
			}
		};
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

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		const url = this.apiBase + '/chat/completions';

		const maxTokensValue = request.maxTokens ?? 2000;
		const modelName = this.extractModelName(request.model);
		
		// Phase D1: Multi-modal Support (Vision)
		const messages = request.messages.map(msg => {
			if (msg.role !== 'user' || !msg.attachments?.some(a => a.type === 'image')) {
				return msg;
			}

			const content: any[] = [{ type: 'text', text: msg.content }];
			for (const att of msg.attachments) {
				if (att.type === 'image' && att.content) {
					content.push({
						type: 'image_url',
						image_url: { url: att.content } // att.content is expected to be data:image/...;base64,...
					});
				}
			}
			return { ...msg, content };
		});

		const body: Record<string, unknown> = {
			model: modelName,
			messages,
			temperature: request.temperature ?? 0.7,
			stream: true,
				stream_options: { include_usage: true },
		};

		if (request.responseFormat !== undefined) {
			body.response_format = request.responseFormat;
		}

		// Use max_completion_tokens for newer models
		if (this.shouldUseMaxCompletionTokens(modelName)) {
			body.max_completion_tokens = maxTokensValue;
		} else {
			body.max_tokens = maxTokensValue;
		}

		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools;
			if (request.toolChoice) {
				body.tool_choice = request.toolChoice;
			}
			if (request.parallelToolCalls !== undefined) {
				body.parallel_tool_calls = request.parallelToolCalls;
			}
		}

		return { url, body };
	}

	protected parseStreamChunk(data: unknown): ParsedStreamChunk | null {
		if (data === '[DONE]') {
			return { content: null, done: true };
		}

		const hasChoices = (obj: unknown): obj is {
			choices?: Array<{
				delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }> };
				finish_reason?: string;
			}>;
		} => {
			return typeof obj === 'object' && obj !== null && 'choices' in obj;
		};

		if (!hasChoices(data)) return null;

		const choice = data.choices?.[0];
		const delta = choice?.delta;

		// Accumulate tool calls from deltas
		if (delta?.tool_calls) {
			for (const tc of delta.tool_calls) {
				const existing = this.toolCallAccumulator.get(tc.index) || { id: '', name: '', arguments: '' };
				if (tc.id) existing.id = tc.id;
				if (tc.function?.name) existing.name = tc.function.name;
				if (tc.function?.arguments) existing.arguments += tc.function.arguments;
				this.toolCallAccumulator.set(tc.index, existing);
			}
		}

		// When finish_reason is tool_calls, emit accumulated tool calls
		if (choice?.finish_reason === 'tool_calls' && this.toolCallAccumulator.size > 0) {
			const toolCalls = Array.from(this.toolCallAccumulator.values()).map(tc => ({
				id: tc.id,
				type: 'function' as const,
				function: { name: tc.name, arguments: tc.arguments }
			}));
			this.toolCallAccumulator.clear();
			return { content: null, done: false, toolCalls };
		}

		// On normal stop, clear accumulator and let [DONE] signal termination
		// (usage chunk may follow before [DONE] when stream_options.include_usage is enabled)
		if (choice?.finish_reason === 'stop') {
			this.toolCallAccumulator.clear();
			return null;
		}

		// Extract usage from final chunk (when stream_options.include_usage is enabled)
		const usageData = (data as Record<string, unknown>).usage as Record<string, number> | null | undefined;
		const usage = usageData ? {
			promptTokens: usageData.prompt_tokens ?? 0,
			completionTokens: usageData.completion_tokens ?? 0,
			totalTokens: usageData.total_tokens ?? 0,
		} : undefined;
		const content = delta?.content;
		if (content) {
			return { content, done: false, usage };
		}
		if (usage) {
			return { content: null, done: false, usage };
		}

		return null;
	}

	async generateEmbedding(text: string, model: string): Promise<number[]> {
		const url = this.apiBase + '/embeddings';
		const body = {
			model: this.extractModelName(model),
			input: text,
		};

		const response = await this.makeRequest(url, body) as {
			json: {
				data: Array<{ embedding: number[] }>;
			}
		};
		return response.json.data[0].embedding;
	}

	/**
	 * Determine if model should use max_completion_tokens instead of max_tokens
	 * Newer models (gpt-4o, gpt-4-turbo, gpt-5, o1, etc.) require max_completion_tokens
	 * Older models (gpt-4, gpt-3.5-turbo) use max_tokens
	 */
	private shouldUseMaxCompletionTokens(model: string | undefined): boolean {
		if (!model) {
			// Default model is gpt-4, which uses max_completion_tokens
			return true;
		}

		// Models that use max_tokens (old API)
		const oldModels = [
			'gpt-3.5-turbo',
			'gpt-4-0613',
			'gpt-4-32k',
		];

		// If it's explicitly an old model, use max_tokens
		if (oldModels.some(oldModel => model === oldModel || model.startsWith(oldModel))) {
			return false;
		}

		// All GPT-5 models use max_completion_tokens
		if (model.startsWith('gpt-5')) {
			return true;
		}

		// Check if it's a newer model that requires max_completion_tokens
		// Use startsWith to catch all variants (gpt-4o, gpt-4o-mini, gpt-4o-2024-*, etc.)
		if (model.startsWith('gpt-4o')) {
			return true;
		}
		if (model.startsWith('gpt-4-turbo')) {
			return true;
		}
		if (model.startsWith('o1-') || model.startsWith('o3-')) {
			return true;
		}

		// For base gpt-4 without specific version, check the date
		// Models from 2024+ likely use the new parameter
		if (model.startsWith('gpt-4-') && !model.includes('0613') && !model.includes('32k')) {
			return true;
		}

		// Default: for unknown models starting with gpt-4, use new parameter
		// This is safer as newer models are more likely to use the new parameter
		if (model.startsWith('gpt-4') && !oldModels.some(old => model.includes(old))) {
			return true;
		}

		// Default to old parameter for safety
		return false;
	}
}
