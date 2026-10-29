import { BaseStreamingProvider, type ChunkParser, type ParsedStreamChunk } from '../base-streaming-provider';
import type { ChatRequest, ChatResponse, LLMMessage } from '../types';

type Part = Record<string, unknown>;

interface Content {
	role: 'user' | 'model';
	parts: Part[];
}

interface WireToolCall {
	id: string;
	function: { name: string; arguments: string };
}

type WireMessage = Omit<LLMMessage, 'role' | 'tool_calls'> & { role: LLMMessage['role'] | 'tool'; tool_calls?: WireToolCall[] };

interface GeminiResponse {
	candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: unknown } }> } }>;
	usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

const UNSUPPORTED_SCHEMA_KEYS = new Set(['$schema', 'additionalProperties', 'strict']);

export class GoogleProvider extends BaseStreamingProvider {
	get name(): string {
		return 'Google (Gemini)';
	}

	protected getProviderName(): string {
		return 'Google';
	}

	protected getHeaders(): Record<string, string> {
		return { 'Content-Type': 'application/json' };
	}

	private modelUrl(model: string, method: string): string {
		const base = this.getBaseUrl('https://generativelanguage.googleapis.com/v1beta');
		return `${base}/models/${this.extractModelName(model)}:${method}?key=${this.config.apiKey ?? ''}`;
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const response = await this.makeRequest(this.modelUrl(request.model, 'generateContent'), this.buildBody(request), request.signal) as { json: GeminiResponse };
		const data = response.json;
		return {
			content: textOf(data),
			usage: {
				promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
				completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
				totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
			},
		};
	}

	async generateEmbedding(text: string, model: string): Promise<number[]> {
		const body = { model: `models/${this.extractModelName(model)}`, content: { parts: [{ text }] } };
		const response = await this.makeRequest(this.modelUrl(model, 'embedContent'), body) as { json: { embedding: { values: number[] } } };
		return response.json.embedding.values;
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: `${this.modelUrl(request.model, 'streamGenerateContent')}&alt=sse`, body: this.buildBody(request) };
	}

	protected createChunkParser(): ChunkParser {
		let callCount = 0;
		return (data): ParsedStreamChunk | null => {
			if (typeof data !== 'object' || data === null || !('candidates' in data)) {
				return null;
			}
			const response = data as GeminiResponse;
			const meta = response.usageMetadata;
			const usage = meta
				? { promptTokens: meta.promptTokenCount ?? 0, completionTokens: meta.candidatesTokenCount ?? 0, totalTokens: meta.totalTokenCount ?? 0 }
				: undefined;
			const toolCalls = (response.candidates?.[0]?.content?.parts ?? [])
				.filter((part) => part.functionCall)
				.map((part) => ({
					id: `gemini-call-${++callCount}`,
					type: 'function' as const,
					function: { name: part.functionCall?.name ?? '', arguments: JSON.stringify(part.functionCall?.args ?? {}) },
				}));
			const content = textOf(response) || null;
			if (!content && !usage && toolCalls.length === 0) {
				return null;
			}
			return { content, done: false, usage, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
		};
	}

	private buildBody(request: ChatRequest): Record<string, unknown> {
		const messages = request.messages as WireMessage[];
		const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
		const body: Record<string, unknown> = {
			contents: toContents(messages),
			generationConfig: generationConfigOf(request),
		};
		if (system) {
			body.systemInstruction = { parts: [{ text: system }] };
		}
		if (request.tools && request.tools.length > 0) {
			body.tools = [{
				functionDeclarations: request.tools.map((tool) => ({
					name: tool.function.name,
					description: tool.function.description,
					parameters: cleanSchema(tool.function.parameters ?? { type: 'object', properties: {} }),
				})),
			}];
			const config = functionCallingConfigOf(request.toolChoice);
			if (config) {
				body.toolConfig = { functionCallingConfig: config };
			}
		}
		return body;
	}
}

function toContents(messages: WireMessage[]): Content[] {
	const callNames = new Map<string, string>();
	const contents: Content[] = [];
	for (const message of messages) {
		if (message.role === 'system') {
			continue;
		}
		if (message.role === 'tool') {
			const part = { functionResponse: { name: callNames.get(message.tool_call_id ?? '') ?? '', response: { content: message.content } } };
			const previous = contents[contents.length - 1];
			if (previous?.role === 'user' && previous.parts.every((p) => 'functionResponse' in p)) {
				previous.parts.push(part);
			} else {
				contents.push({ role: 'user', parts: [part] });
			}
			continue;
		}
		if (message.role === 'assistant') {
			const parts: Part[] = message.content ? [{ text: message.content }] : [];
			for (const call of message.tool_calls ?? []) {
				callNames.set(call.id, call.function.name);
				parts.push({ functionCall: { name: call.function.name, args: parseArguments(call.function.arguments) } });
			}
			contents.push({ role: 'model', parts });
			continue;
		}
		contents.push({ role: 'user', parts: userParts(message) });
	}
	return contents;
}

function userParts(message: WireMessage): Part[] {
	const parts: Part[] = [{ text: message.content }];
	for (const attachment of message.attachments ?? []) {
		const match = attachment.type === 'image' ? attachment.content?.match(/^data:([^;]+);base64,(.+)$/) : null;
		if (match) {
			parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
		}
	}
	return parts;
}

function textOf(response: GeminiResponse): string {
	return (response.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
}

function parseArguments(raw: string): unknown {
	try {
		return JSON.parse(raw || '{}');
	} catch {
		return {};
	}
}

function cleanSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(cleanSchema);
	}
	if (schema && typeof schema === 'object') {
		return Object.fromEntries(
			Object.entries(schema).filter(([key]) => !UNSUPPORTED_SCHEMA_KEYS.has(key)).map(([key, value]) => [key, cleanSchema(value)]),
		);
	}
	return schema;
}

function functionCallingConfigOf(choice: ChatRequest['toolChoice']): Record<string, unknown> | undefined {
	if (!choice) return undefined;
	if (choice === 'auto') return { mode: 'AUTO' };
	if (choice === 'required') return { mode: 'ANY' };
	if (choice === 'none') return { mode: 'NONE' };
	return { mode: 'ANY', allowedFunctionNames: [choice.function.name] };
}

function generationConfigOf(request: ChatRequest): Record<string, unknown> {
	const config: Record<string, unknown> = {
		temperature: request.temperature ?? 0.7,
		maxOutputTokens: request.maxTokens ?? 2000,
	};
	if (request.responseFormat?.type === 'json_object' || request.responseFormat?.type === 'json_schema') {
		config.responseMimeType = 'application/json';
	}
	if (request.responseFormat?.type === 'json_schema' && request.responseFormat.json_schema) {
		config.responseSchema = request.responseFormat.json_schema.schema;
	}
	return config;
}
