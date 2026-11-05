import { assertCompletionStatus, completionError } from '../completion-status';
import { assertRequestOptions } from '../request-options';
import { BaseStreamingProvider, type ChunkParser, type ParsedStreamChunk } from '../base-streaming-provider';
import type { ChatRequest, ChatResponse, LLMMessage } from '../types';

type ContentBlock = Record<string, unknown>;

interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | ContentBlock[];
}

interface WireToolCall {
	id: string;
	function: { name: string; arguments: string };
}

type WireMessage = Omit<LLMMessage, 'role' | 'tool_calls'> & { role: LLMMessage['role'] | 'tool'; tool_calls?: WireToolCall[] };

interface StreamEvent {
	type: string;
	index?: number;
	message?: { usage?: { input_tokens?: number } };
	content_block?: { type: string; id?: string; name?: string };
	delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
	usage?: { output_tokens?: number };
}

const JSON_ONLY = 'Respond with a valid JSON object only. Do not include markdown fences or explanatory text.';

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

	private get messagesUrl(): string {
		return `${this.getBaseUrl('https://api.anthropic.com/v1')}/messages`;
	}

	protected prepareBufferedRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: this.messagesUrl, body: this.buildBody(request, false) };
	}
	protected decodeBufferedResponse(raw: unknown): ChatResponse {
		const data = raw as { stop_reason?: string; content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; usage?: { input_tokens?: number; output_tokens?: number } };
		assertCompletionStatus(data?.stop_reason, data.usage ? { promptTokens: data.usage.input_tokens ?? 0, completionTokens: data.usage.output_tokens ?? 0, totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) } : undefined, data.content?.filter(block => block.type === 'text').map(block => block.text ?? '').join(''));
		if (!Array.isArray(data?.content)) throw new Error('The service returned no Anthropic content blocks');
		return { content: data.content.filter(block => block.type === 'text').map(block => block.text ?? '').join(''),
			toolCalls: data.content.filter(block => block.type === 'tool_use').map(block => ({ id: block.id ?? '', type: 'function', function: { name: block.name ?? '', arguments: JSON.stringify(block.input ?? {}) } })),
			usage: data.usage ? { promptTokens: data.usage.input_tokens ?? 0, completionTokens: data.usage.output_tokens ?? 0, totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) } : undefined };
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: this.messagesUrl, body: this.buildBody(request, true) };
	}

	protected createChunkParser(): ChunkParser {
		let inputTokens = 0;
		const toolBlocks = new Map<number, { id: string; name: string; arguments: string }>();
		return (data) => {
			if (typeof data !== 'object' || data === null || !('type' in data)) {
				return null;
			}
			const event = data as StreamEvent;
			switch (event.type) {
				case 'message_start':
					inputTokens = event.message?.usage?.input_tokens ?? 0;
					return null;
				case 'content_block_start':
					if (event.content_block?.type === 'tool_use') {
						toolBlocks.set(event.index ?? 0, { id: event.content_block.id ?? '', name: event.content_block.name ?? '', arguments: '' });
					}
					return null;
				case 'content_block_delta':
					return this.applyDelta(event, toolBlocks);
				case 'message_delta':
					return this.finishMessage(event, inputTokens, toolBlocks);
				case 'message_stop':
					return { content: null, done: true };
				default:
					return null;
			}
		};
	}

	private applyDelta(event: StreamEvent, toolBlocks: Map<number, { arguments: string }>): ParsedStreamChunk | null {
		if (event.delta?.type === 'input_json_delta') {
			const block = toolBlocks.get(event.index ?? 0);
			if (block) {
				block.arguments += event.delta.partial_json ?? '';
			}
			return null;
		}
		return event.delta?.text ? { content: event.delta.text, done: false } : null;
	}

	private finishMessage(
		event: StreamEvent,
		inputTokens: number,
		toolBlocks: Map<number, { id: string; name: string; arguments: string }>,
	): ParsedStreamChunk {
		const outputTokens = event.usage?.output_tokens ?? 0;
		const usage = { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens };
		const failure = completionError(event.delta?.stop_reason, usage);
		if (failure) return { content: null, done: false, complete: true, usage, failure };
		if (toolBlocks.size === 0) {
			return { content: null, done: false, usage };
		}
		const toolCalls = [...toolBlocks.values()].map((block) => ({
			id: block.id,
			type: 'function' as const,
			function: { name: block.name, arguments: block.arguments || '{}' },
		}));
		toolBlocks.clear();
		return { content: null, done: false, usage, toolCalls };
	}

	private buildBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
		assertRequestOptions(this.name, request, ['topK', 'user', 'metadata', 'parallelToolCalls']);
		const { system, messages } = convertAnthropicMessages(request.messages);
		const body: Record<string, unknown> = {
			model: this.extractModelName(request.model),
			messages,
			max_tokens: request.maxTokens ?? 4096,
			temperature: request.temperature ?? 0.7,
			stream,
		};
		if (request.user) body.metadata = { user_id: request.user };
		if (request.metadata && Object.keys(request.metadata).some(key => key !== 'user_id')) throw new Error('Anthropic metadata only supports user_id');
		if (request.metadata?.user_id) body.metadata = { user_id: request.metadata.user_id };
		const systemPrompt = withResponseFormat(system, request.responseFormat);
		if (systemPrompt) {
			body.system = systemPrompt;
		}
		if (request.topP !== undefined) body.top_p = request.topP;
		if (request.topK !== undefined) body.top_k = request.topK;
		if (request.stopSequences ?? request.stop) body.stop_sequences = request.stopSequences ?? (typeof request.stop === 'string' ? [request.stop] : request.stop);
		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools.map((tool) => ({
				name: tool.function.name,
				description: tool.function.description,
				input_schema: tool.function.parameters ?? { type: 'object', properties: {} },
			}));
			const choice = toolChoiceOf(request.toolChoice);
			if (choice) {
				body.tool_choice = { ...choice, ...(request.parallelToolCalls === false ? { disable_parallel_tool_use: true } : {}) };
			}
		}
		return body;
	}
}

export function convertAnthropicMessages(input: LLMMessage[]): { system?: string; messages: AnthropicMessage[] } {
	const messages = input as WireMessage[];
	const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n') || undefined;
	const converted: AnthropicMessage[] = [];
	for (const message of messages) {
		if (message.role === 'system') {
			continue;
		}
		if (message.role === 'tool') {
			const result = { type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content };
			const previous = converted[converted.length - 1];
			if (previous?.role === 'user' && Array.isArray(previous.content) && previous.content.every((block) => block.type === 'tool_result')) {
				previous.content.push(result);
			} else {
				converted.push({ role: 'user', content: [result] });
			}
			continue;
		}
		if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
			const blocks: ContentBlock[] = message.content ? [{ type: 'text', text: message.content }] : [];
			for (const call of message.tool_calls) {
				blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) });
			}
			converted.push({ role: 'assistant', content: blocks });
			continue;
		}
		converted.push({ role: message.role, content: userContent(message) });
	}
	return { system, messages: converted };
}

function userContent(message: WireMessage): string | ContentBlock[] {
	const images = (message.attachments ?? [])
		.filter((attachment) => attachment.type === 'image' && attachment.content)
		.map((attachment) => attachment.content?.match(/^data:([^;]+);base64,(.+)$/))
		.filter((match): match is RegExpMatchArray => Boolean(match));
	if (message.role !== 'user' || images.length === 0) {
		return message.content;
	}
	return [
		{ type: 'text', text: message.content },
		...images.map((match) => ({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } })),
	];
}

function parseArguments(raw: string): unknown {
	try {
		return JSON.parse(raw || '{}');
	} catch {
		return {};
	}
}

function toolChoiceOf(choice: ChatRequest['toolChoice']): Record<string, string> | undefined {
	if (!choice) return undefined;
	if (choice === 'auto') return { type: 'auto' };
	if (choice === 'required') return { type: 'any' };
	if (choice === 'none') return { type: 'none' };
	return { type: 'tool', name: choice.function.name };
}

function withResponseFormat(system: string | undefined, format: ChatRequest['responseFormat']): string | undefined {
	if (format?.type === 'json_object') {
		return [system, JSON_ONLY].filter(Boolean).join('\n\n');
	}
	if (format?.type === 'json_schema' && format.json_schema) {
		return [system, 'Respond with valid JSON only. Do not include markdown fences or explanatory text.', `JSON schema: ${JSON.stringify(format.json_schema.schema)}`]
			.filter(Boolean)
			.join('\n\n');
	}
	return system;
}
