import { BaseLLMProvider } from '../base-provider';
import { StreamTransportUnavailableError } from '../http';
import type { ChatRequest, ChatResponse, LLMMessage, StreamChunk } from '../types';
import type { ModelCapability, ModelInfo } from '../types';

interface OllamaToolCall {
	function: { name: string; arguments?: unknown };
}

interface OllamaChatApiResponse {
	message?: { content?: string; tool_calls?: OllamaToolCall[] };
	done?: boolean;
	prompt_eval_count?: number;
	eval_count?: number;
}

interface WireToolCall {
	id?: string;
	function: { name: string; arguments: string };
}

type WireMessage = Omit<LLMMessage, 'role' | 'tool_calls'> & { role: LLMMessage['role'] | 'tool'; tool_calls?: WireToolCall[] };

interface OllamaModelsResponse {
	models?: Array<{ name: string; [key: string]: unknown }>;
}

/**
 * Ollama Provider using native Ollama API
 * API Documentation: https://docs.ollama.com/api
 */
export class OllamaProvider extends BaseLLMProvider {
	get name(): string {
		return 'Ollama';
	}

	protected getHeaders(): Record<string, string> {
		// Ollama API uses simple JSON requests without authentication by default
		return {
			'Content-Type': 'application/json',
		};
	}

	private getBaseUrl(): string {
		return this.config.baseUrl || 'http://localhost:11434';
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const data = await this.requestCompletion(request);
		return { content: data.message?.content ?? '', usage: usageOf(data) };
	}

	async generateEmbedding(text: string, model: string): Promise<number[]> {
		const url = `${this.getBaseUrl()}/api/embed`;
		const modelName = model.includes(':') ? model.split(':').slice(1).join(':') : model;
		const response = await this.http.request({
			url,
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify({ model: modelName, input: text }),
		});
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Ollama embed API failed: ${String(response.status)}`);
		}
		const data = response.json as { embeddings?: number[][] };
		if (data.embeddings && data.embeddings.length > 0) {
			return data.embeddings[0];
		}
		throw new Error('Ollama embedding returned empty result');
	}

	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		let response: Awaited<ReturnType<typeof this.http.stream>>;
		try {
			response = await this.http.stream({
				url: this.chatUrl,
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(this.buildBody(request, true)),
				signal: request.signal,
			});
		} catch (error) {
			if (!(error instanceof StreamTransportUnavailableError)) {
				throw error;
			}
			const data = await this.requestCompletion(request);
			const calls = new ToolCallIds();
			emit(data, calls, onChunk);
			onChunk({ content: '', done: true, usage: usageOf(data) });
			return;
		}
		if (!response.ok || !response.body) {
			throw new Error(`Ollama API request failed: ${response.status} ${await response.text()}`);
		}
		await this.readLines(response.body, onChunk, request.signal);
	}

	private get chatUrl(): string {
		return `${this.getBaseUrl()}/api/chat`;
	}

	private async requestCompletion(request: ChatRequest): Promise<OllamaChatApiResponse> {
		const response = await this.http.request({
			url: this.chatUrl,
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify(this.buildBody(request, false)),
			signal: request.signal,
		});
		if (!response.ok) {
			throw new Error(`Ollama API request failed: ${response.status} ${response.text}`);
		}
		return response.json as OllamaChatApiResponse;
	}

	private async readLines(body: ReadableStream<Uint8Array>, onChunk: (_chunk: StreamChunk) => void, signal?: AbortSignal): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		const calls = new ToolCallIds();
		const cancel = () => {
			reader.cancel().catch(() => undefined);
		};
		signal?.addEventListener('abort', cancel, { once: true });
		let buffer = '';
		try {
			while (!signal?.aborted) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines.filter((l) => l.trim())) {
					const data = parseLine(line);
					if (!data) continue;
					emit(data, calls, onChunk);
					if (data.done) {
						onChunk({ content: '', done: true, usage: usageOf(data) });
						return;
					}
				}
			}
			onChunk({ content: '', done: true });
		} finally {
			signal?.removeEventListener('abort', cancel);
			reader.releaseLock();
		}
	}

	private buildBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: request.model.includes(':') ? request.model.split(':').slice(1).join(':') : request.model,
			messages: (request.messages as WireMessage[]).map(toOllamaMessage),
			stream,
			options: {
				temperature: request.temperature ?? 0.7,
				num_predict: request.maxTokens ?? 2000,
			},
		};
		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools;
		}
		return body;
	}

	/**
	 * Fetch available models from Ollama API
	 * API Documentation: https://docs.ollama.com/api#list-models
	 */
	async fetchModels(): Promise<ModelInfo[]> {
		const baseUrl = this.getBaseUrl();

		try {
			const url = `${baseUrl ?? 'unknown'}/api/tags`;

			const response = await this.http.request({
				url: url,
				method: 'GET',
				headers: this.getHeaders(),
			});

			if (response.status < 200 || response.status >= 300) {
				const errorText = response.text;
				console.error('[Ollama] API error response:', response.status, errorText);
				throw new Error(`Failed to fetch Ollama models: ${response.status} - ${errorText}`);
			}

			const data = JSON.parse(response.text) as OllamaModelsResponse;

			// Check if models array exists
			if (!data || !data.models || !Array.isArray(data.models)) {
				console.error('[Ollama] Invalid response format. Expected {models: []}, got:', data);
				throw new Error('Invalid response format from Ollama API. Make sure Ollama is running.');
			}

			if (data.models.length === 0) {
				console.warn('[Ollama] No models found. Have you pulled any models? Run: ollama pull llama3.2');
				return [];
			}

			// Map Ollama models to ModelInfo format
			return await Promise.all(data.models.map(async (model: { name: string }) => ({
				id: `ollama:${model.name ?? 'unknown'}`,
				name: model.name,
				provider: 'ollama',
				capabilities: (await this.reportedCapabilities(baseUrl, model.name)) ?? this.inferCapabilities(model.name),
				enabled: true,
			})));
		} catch (error: unknown) {
			console.error('[Ollama] Failed to fetch models:', error);

			// Type guard for error with message property
			const errorMessage = error instanceof Error ? error.message : String(error);

			console.error('[Ollama] Error details:', {
				message: errorMessage,
				baseUrl: baseUrl,
				suggestion: 'Make sure Ollama is running. Run: ollama serve'
			});

			// Check if it's a connection error
			if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('ECONNREFUSED')) {
				console.error('[Ollama] Connection refused. Is Ollama running on', baseUrl, '?');
				console.error('[Ollama] Try running: ollama serve');
			}

			// Return empty array instead of throwing to allow graceful degradation
			return [];
		}
	}

	private async reportedCapabilities(baseUrl: string | undefined, name: string): Promise<ModelCapability[] | null> {
		try {
			const response = await this.http.request({
				url: `${baseUrl ?? ''}/api/show`,
				method: 'POST',
				headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: name }),
			});
			const reported = response.ok ? (response.json as { capabilities?: unknown } | undefined)?.capabilities : undefined;
			return Array.isArray(reported) && reported.length > 0 ? fromOllamaCapabilities(reported as string[]) : null;
		} catch {
			return null;
		}
	}

	/**
	 * Infer model capabilities from model name
	 */
	private inferCapabilities(modelName: string): ModelCapability[] {
		const capabilities: ModelCapability[] = ['chat', 'streaming'];

		// Check for vision models (common vision model patterns)
		if (modelName.includes('vision') || 
			modelName.includes('llava') || 
			modelName.includes('llama-vision') ||
			modelName.includes('phi3-vision') ||
			modelName.includes('qwen-vl')) {
			capabilities.push('vision');
		}

		// Check for reasoning models
		if (modelName.includes('reasoning') || modelName.includes('r1')) {
			capabilities.push('reasoning');
		}

		// Check for embedding models
		if (modelName.includes('embedding') || modelName.includes('nomic-embed')) {
			return ['embedding'];
		}

		// Most modern models support function calling
		capabilities.push('function_calling');

		return capabilities;
	}
}

const OLLAMA_CAPABILITIES: Record<string, ModelCapability> = {
	vision: 'vision',
	thinking: 'reasoning',
	tools: 'function_calling',
};

function fromOllamaCapabilities(reported: string[]): ModelCapability[] {
	if (!reported.includes('completion')) {
		return reported.includes('embedding') ? ['embedding'] : [];
	}
	return ['chat', 'streaming', ...reported.flatMap(capability => OLLAMA_CAPABILITIES[capability] ?? [])];
}

class ToolCallIds {
	private count = 0;

	next(): string {
		return `ollama-call-${++this.count}`;
	}
}

function emit(data: OllamaChatApiResponse, calls: ToolCallIds, onChunk: (_chunk: StreamChunk) => void): void {
	if (data.message?.content) {
		onChunk({ content: data.message.content, done: false });
	}
	const toolCalls = (data.message?.tool_calls ?? []).map((call) => ({
		id: calls.next(),
		type: 'function' as const,
		function: { name: call.function.name, arguments: JSON.stringify(call.function.arguments ?? {}) },
	}));
	if (toolCalls.length > 0) {
		onChunk({ content: '', done: false, toolCalls });
	}
}

function usageOf(data: OllamaChatApiResponse): StreamChunk['usage'] {
	if (data.prompt_eval_count === undefined && data.eval_count === undefined) {
		return undefined;
	}
	const promptTokens = data.prompt_eval_count ?? 0;
	const completionTokens = data.eval_count ?? 0;
	return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

function parseLine(line: string): OllamaChatApiResponse | null {
	try {
		return JSON.parse(line) as OllamaChatApiResponse;
	} catch (error) {
		console.error('[Ollama] Failed to parse JSON line:', error);
		return null;
	}
}

function toOllamaMessage(message: WireMessage): Record<string, unknown> {
	const wire: Record<string, unknown> = { role: message.role, content: message.content };
	const images = (message.attachments ?? [])
		.map((attachment) => attachment.type === 'image' ? attachment.content?.match(/^data:[^;]+;base64,(.+)$/)?.[1] : undefined)
		.filter((data): data is string => Boolean(data));
	if (images.length > 0) {
		wire.images = images;
	}
	if (message.tool_calls && message.tool_calls.length > 0) {
		wire.tool_calls = message.tool_calls.map((call) => ({ function: { name: call.function.name, arguments: parseArguments(call.function.arguments) } }));
	}
	return wire;
}

function parseArguments(raw: string): unknown {
	try {
		return JSON.parse(raw || '{}');
	} catch {
		return {};
	}
}
