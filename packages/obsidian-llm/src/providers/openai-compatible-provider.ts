import { BaseStreamingProvider, type ChunkParser, type ParsedStreamChunk } from '../base-streaming-provider';
import type { ChatRequest, ChatResponse } from '../types';
import { toOpenAiWireMessages } from '../openai-message';

type TokenLimitField = 'max_tokens' | 'max_completion_tokens';

interface WireToolCallDelta {
	index: number;
	id?: string;
	function?: { name?: string; arguments?: string };
}

interface WireChunk {
	choices?: Array<{
		delta?: { content?: string; reasoning_content?: string; tool_calls?: WireToolCallDelta[] };
		finish_reason?: string;
	}>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

interface WireCompletion {
	choices: Array<{ message: { content: string } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const DEFAULT_MAX_TOKENS = 2000;

export abstract class OpenAICompatibleProvider extends BaseStreamingProvider {
	protected abstract readonly defaultBaseUrl: string;
	protected readonly includeStreamUsage: boolean = true;
	protected readonly supportsEmbeddings: boolean = true;

	protected getProviderName(): string {
		return this.name;
	}

	protected get apiBase(): string {
		return this.getBaseUrl(this.defaultBaseUrl);
	}

	protected getHeaders(): Record<string, string> {
		return {
			...super.getHeaders(),
			'Authorization': `Bearer ${this.config.apiKey ?? ''}`,
		};
	}

	protected tokenLimitField(_model: string): TokenLimitField {
		return 'max_tokens';
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const response = await this.makeRequest(`${this.apiBase}/chat/completions`, this.buildBody(request, false), request.signal) as { json: WireCompletion };
		const { choices, usage } = response.json;
		return {
			content: choices[0].message.content,
			usage: {
				promptTokens: usage?.prompt_tokens ?? 0,
				completionTokens: usage?.completion_tokens ?? 0,
				totalTokens: usage?.total_tokens ?? 0,
			},
		};
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: `${this.apiBase}/chat/completions`, body: this.buildBody(request, true) };
	}

	async generateEmbedding(text: string, model: string): Promise<number[]> {
		if (!this.supportsEmbeddings) {
			throw new Error(`Embedding generation not supported by ${this.name} provider.`);
		}
		const response = await this.makeRequest(`${this.apiBase}/embeddings`, { model: this.extractModelName(model), input: text }) as {
			json: { data: Array<{ embedding: number[] }> };
		};
		return response.json.data[0].embedding;
	}

	protected createChunkParser(): ChunkParser {
		const pending = new Map<number, { id: string; name: string; arguments: string }>();
		return (data) => {
			if (data === '[DONE]') {
				return { content: null, done: true };
			}
			const chunk = data as WireChunk;
			if (!chunk || typeof chunk !== 'object' || !('choices' in chunk)) {
				return null;
			}
			const choice = chunk.choices?.[0];
			const delta = choice?.delta;
			for (const call of delta?.tool_calls ?? []) {
				const entry = pending.get(call.index) ?? { id: '', name: '', arguments: '' };
				entry.id = call.id ?? entry.id;
				entry.name = call.function?.name ?? entry.name;
				entry.arguments += call.function?.arguments ?? '';
				pending.set(call.index, entry);
			}
			if (choice?.finish_reason === 'tool_calls' && pending.size > 0) {
				const toolCalls = [...pending.values()].map((call) => ({
					id: call.id,
					type: 'function' as const,
					function: { name: call.name, arguments: call.arguments },
				}));
				pending.clear();
				return { content: null, done: false, toolCalls };
			}
			if (choice?.finish_reason === 'stop') {
				pending.clear();
				return null;
			}
			return contentOf(delta, chunk.usage);
		};
	}

	private buildBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
		const model = this.extractModelName(request.model);
		const body: Record<string, unknown> = {
			model,
			messages: toOpenAiWireMessages(request.messages),
			temperature: request.temperature ?? 0.7,
			stream,
			[this.tokenLimitField(model)]: request.maxTokens ?? DEFAULT_MAX_TOKENS,
		};
		if (stream && this.includeStreamUsage) {
			body.stream_options = { include_usage: true };
		}
		if (request.responseFormat !== undefined) {
			body.response_format = request.responseFormat;
		}
		if (stream && request.tools && request.tools.length > 0) {
			body.tools = request.tools;
			if (request.toolChoice) {
				body.tool_choice = request.toolChoice;
			}
			if (request.parallelToolCalls !== undefined) {
				body.parallel_tool_calls = request.parallelToolCalls;
			}
		}
		return body;
	}
}

function contentOf(
	delta: { content?: string; reasoning_content?: string } | undefined,
	rawUsage: WireChunk['usage'],
): ParsedStreamChunk | null {
	const usage = rawUsage
		? { promptTokens: rawUsage.prompt_tokens ?? 0, completionTokens: rawUsage.completion_tokens ?? 0, totalTokens: rawUsage.total_tokens ?? 0 }
		: undefined;
	if (delta?.content || delta?.reasoning_content) {
		return { content: delta.content || null, done: false, reasoning: delta.reasoning_content || undefined, usage };
	}
	return usage ? { content: null, done: false, usage } : null;
}
