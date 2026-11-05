import { assertCompletionStatus, completionError } from '../completion-status';
import { assertRequestOptions } from '../request-options';
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
	choices: Array<{ finish_reason?: string; message: { content: string; reasoning_content?: string; tool_calls?: ChatResponse['toolCalls'] } }>;
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

	protected prepareBufferedRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: `${this.apiBase}/chat/completions`, body: this.buildBody(request, false) };
	}
	protected decodeBufferedResponse(raw: unknown): ChatResponse {
		const data = raw as WireCompletion;
		const usage = tokenUsageOf(data?.usage);
		assertCompletionStatus(data?.choices?.[0]?.finish_reason, usage, data?.choices?.[0]?.message?.content ?? undefined, data?.choices?.[0]?.message?.reasoning_content);
		const message = data?.choices?.[0]?.message;
		if (!message) throw new Error('The service returned no completion message');
		return { content: message.content ?? '', reasoning: message.reasoning_content, toolCalls: message.tool_calls,
			usage };
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: `${this.apiBase}/chat/completions`, body: this.buildBody(request, true) };
	}

	async generateEmbedding(text: string, model: string, options?: { signal?: AbortSignal }): Promise<number[]> {
		if (!this.supportsEmbeddings) {
			throw new Error(`Embedding generation not supported by ${this.name} provider.`);
		}
		const response = await this.makeRequest(`${this.apiBase}/embeddings`, { model: this.extractModelName(model), input: text }, options?.signal) as {
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
			const failure = completionError(choice?.finish_reason, tokenUsageOf(chunk.usage));
			const delta = choice?.delta;
			if (failure) return { ...contentOf(delta, chunk.usage), content: delta?.content ?? null, done: false, complete: true, failure };
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
				return { content: null, done: false, complete: true, toolCalls };
			}
			if (choice?.finish_reason) {
				if (pending.size) return { ...contentOf(delta, chunk.usage), content: delta?.content ?? null, done: false, complete: true, failure: new Error('The service ended with incomplete tool arguments') };
				return { ...contentOf(delta, chunk.usage), content: delta?.content ?? null, done: false, complete: true };
			}
			return contentOf(delta, chunk.usage);
		};
	}

	private buildBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
		assertRequestOptions(this.name, request, ['frequencyPenalty', 'presencePenalty', 'maxCompletionTokens', 'n', 'logitBias', 'logprobs', 'topLogprobs', 'user', 'seed', 'streamOptions', 'parallelToolCalls', 'dataSources', 'audio', 'modalities', 'prediction', 'metadata', 'store', 'reasoningEffort', 'userSecurityContext', 'thinking']);
		const model = this.extractModelName(request.model);
		const includeReasoning = Boolean(request.tools?.length) && (this.name === 'DeepSeek' || model.split('/').pop()?.toLowerCase().startsWith('deepseek-'));
		const body: Record<string, unknown> = {
			model,
			messages: toOpenAiWireMessages(request.messages, includeReasoning),
			temperature: request.temperature ?? 0.7,
			stream,
			[this.tokenLimitField(model)]: request.maxTokens ?? DEFAULT_MAX_TOKENS,
		};
		if (stream && this.includeStreamUsage) {
			body.stream_options = request.streamOptions ?? { include_usage: true };
		}
		const reasoning = /^(gpt-5|o[134](?:-|$))/.test(model);
		if (reasoning) delete body.temperature;
		const fields: Array<[keyof ChatRequest, string]> = [
			['topP', 'top_p'], ['frequencyPenalty', 'frequency_penalty'], ['presencePenalty', 'presence_penalty'], ['stop', 'stop'],
			['n', 'n'], ['logitBias', 'logit_bias'], ['logprobs', 'logprobs'], ['topLogprobs', 'top_logprobs'], ['user', 'user'],
			['seed', 'seed'], ['dataSources', 'data_sources'], ['userSecurityContext', 'user_security_context'], ['audio', 'audio'], ['modalities', 'modalities'], ['prediction', 'prediction'], ['metadata', 'metadata'], ['store', 'store'], ['reasoningEffort', 'reasoning_effort'], ['thinking', 'thinking'],
		];
		for (const [key, wire] of fields) if (request[key] !== undefined && !(reasoning && ['topP', 'frequencyPenalty', 'presencePenalty', 'logitBias', 'logprobs', 'topLogprobs', 'n'].includes(key))) body[wire] = request[key];
		if (request.stop === undefined && request.stopSequences) body.stop = request.stopSequences;
		if (request.maxCompletionTokens !== undefined) { delete body.max_tokens; body.max_completion_tokens = request.maxCompletionTokens; }
		if (request.responseFormat !== undefined) {
			body.response_format = request.responseFormat;
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
		return body;
	}
}

function contentOf(
	delta: { content?: string; reasoning_content?: string } | undefined,
	rawUsage: WireChunk['usage'],
): ParsedStreamChunk | null {
	const usage = tokenUsageOf(rawUsage);
	if (delta?.content || delta?.reasoning_content) {
		return { content: delta.content || null, done: false, reasoning: delta.reasoning_content || undefined, usage };
	}
	return usage ? { content: null, done: false, usage } : null;
}

function tokenUsageOf(raw: WireChunk['usage']): StreamChunkUsage | undefined {
	return raw ? { promptTokens: raw.prompt_tokens ?? 0, completionTokens: raw.completion_tokens ?? 0, totalTokens: raw.total_tokens ?? 0 } : undefined;
}
type StreamChunkUsage = NonNullable<ChatResponse['usage']>;
