import { BaseLLMProvider } from './base-provider';
import type { ChatRequest, ChatResponse, StreamChunk } from './types';
import { CompletionError } from './completion-status';
import { StreamTransportUnavailableError } from './http';

export interface ParsedStreamChunk {
	content: string | null;
	done: boolean;
	/** Completion received; usage may still follow before the stream closes. */
	complete?: boolean;
	reasoning?: string;
	usage?: StreamChunk['usage'];
	toolCalls?: StreamChunk['toolCalls'];
	/** Defer terminal errors until trailing usage has been consumed. */
	failure?: Error;
}
export type ChunkParser = (data: unknown) => ParsedStreamChunk | null;

/** Transport/framing only. Buffered endpoint selection and decoding belong to each protocol. */
export abstract class BaseStreamingProvider extends BaseLLMProvider {
	protected abstract createChunkParser(): ChunkParser;
	protected abstract getProviderName(): string;
	protected abstract prepareStreamRequest(request: ChatRequest): { url: string; body: unknown };
	protected prepareBufferedRequest(_request: ChatRequest): { url: string; body: unknown } { throw new Error(`${this.name} has no buffered request adapter`); }
	protected decodeBufferedResponse(_data: unknown): ChatResponse { throw new Error(`${this.name} has no buffered response decoder`); }

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const { url, body } = this.prepareBufferedRequest(request);
		const response = await this.makeRequest(url, body, request.signal) as { json: unknown };
		return this.decodeBufferedResponse(response.json);
	}
	async streamChat(request: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<void> {
		const { url, body } = this.prepareStreamRequest(request);
		let response;
		try {
			response = await this.http.stream({ url, method: 'POST', headers: this.getHeaders(), body: JSON.stringify(body), signal: request.signal });
		} catch (error) {
			if (request.signal?.aborted) throw error;
			if (!(error instanceof StreamTransportUnavailableError)) throw error;
			await this.streamBuffered(request, onChunk);
			return;
		}
		if (!response.ok) throw new Error(`API request failed: HTTP ${response.status}`);
		if (!response.body) throw new Error('The service returned no stream body');
		await this.processStream(response.body, onChunk, request.signal);
	}
	/** Buffer the real SSE response without switching protocols or losing finish metadata. */
	protected async streamBuffered(request: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<void> {
		const { url, body } = this.prepareStreamRequest(request);
		const response = await this.makeRequest(url, body, request.signal) as { text: string };
		request.signal?.throwIfAborted();
		// The host has already buffered the body. Coalesce genuine events to avoid
		// thousands of synchronous DOM updates, while still validating every frame.
		const collected: StreamChunk = { content: '', done: false };
		try {
			await this.processStream(new Blob([response.text]).stream(), chunk => {
				collected.content += chunk.content;
				if (chunk.reasoning) collected.reasoning = (collected.reasoning ?? '') + chunk.reasoning;
				if (chunk.toolCalls) collected.toolCalls = [...collected.toolCalls ?? [], ...chunk.toolCalls];
				collected.usage = chunk.usage ?? collected.usage;
			}, request.signal);
		} catch (error) {
			if (!request.signal?.aborted && (collected.content || collected.reasoning || collected.usage)) onChunk({ ...collected, toolCalls: undefined });
			throw error;
		}
		request.signal?.throwIfAborted();
		if (collected.content || collected.reasoning || collected.toolCalls?.length) onChunk(collected);
		onChunk({ content: '', done: true, usage: collected.usage });
	}
	private async processStream(body: ReadableStream<Uint8Array>, onChunk: (chunk: StreamChunk) => void, signal?: AbortSignal): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		const parse = this.createChunkParser();
		let buffer = '';
		let frame: string[] = [];
		let complete = false;
		let done = false;
		let lastUsage: StreamChunk['usage'];
		let failure: Error | undefined;
		let partialContent = '';
		let partialReasoning = '';
		const emitFrame = () => {
			if (!frame.length) return;
			const raw = frame.join('\n'); frame = [];
			if (raw.length > 4_000_000) throw new Error('Stream event exceeded the size limit');
			if (raw.trim() === '[DONE]') { complete = true; done = true; return; }
			const data = JSON.parse(raw) as { error?: unknown; type?: string };
			if (data.error || data.type === 'error') throw new Error(`${this.getProviderName()} returned a stream error`);
			const result = parse(data);
			if (!result) return;
			lastUsage = result.usage ?? lastUsage;
			failure ??= result.failure;
			partialContent += result.content ?? '';
			partialReasoning += result.reasoning ?? '';
			if (result.content || result.reasoning || result.toolCalls?.length || result.usage) onChunk({ content: result.content ?? '', reasoning: result.reasoning, toolCalls: result.toolCalls, usage: result.usage, done: false });
			complete ||= Boolean(result.complete || result.done);
			done ||= result.done;
		};
		const line = (value: string) => {
			if (value === '') emitFrame();
			else if (value.startsWith('data:')) frame.push(value.slice(5).replace(/^ /, ''));
		};
		const abort = () => { void reader.cancel().catch(() => undefined); };
		signal?.addEventListener('abort', abort, { once: true });
		try {
			while (!done) {
				signal?.throwIfAborted();
				const next = await reader.read();
				if (next.done) break;
				buffer += decoder.decode(next.value, { stream: true });
				let end: number;
				while (!done && (end = buffer.indexOf('\n')) >= 0) { const current = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1); line(current); }
				if (buffer.length + frame.reduce((n, item) => n + item.length, 0) > 4_000_000) throw new Error('Stream event exceeded the size limit');
			}
			signal?.throwIfAborted();
			if (!done) { buffer += decoder.decode(); if (buffer) line(buffer.replace(/\r$/, '')); emitFrame(); }
			if (!complete) throw new Error('The service stream ended before a completion marker; partial output was not treated as a completed answer');
			if (failure) throw failure instanceof CompletionError ? new CompletionError(failure.finishReason, lastUsage ?? failure.usage, partialContent || failure.partialContent, partialReasoning || failure.partialReasoning) : failure;
			onChunk({ content: '', done: true, usage: lastUsage });
		} finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
	}
	protected extractModelName(modelId: string): string { return modelId.includes(':') ? modelId.slice(modelId.indexOf(':') + 1) : modelId; }
	protected getBaseUrl(defaultUrl: string): string { return (this.config.baseUrl || defaultUrl).replace(/\/$/, ''); }
}
