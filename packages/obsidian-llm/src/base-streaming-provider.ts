/**
 * Base Streaming Provider
 * Provides common SSE streaming infrastructure for all LLM providers
 */

import { BaseLLMProvider } from './base-provider';
import { ChatRequest, StreamChunk } from './types';
import { StreamTransportUnavailableError } from './http';

/**
 * Result of parsing a streaming chunk
 */
export type ChunkParser = (data: unknown) => ParsedStreamChunk | null;

export interface ParsedStreamChunk {
	/** Text content extracted from the chunk */
	content: string | null;
	/** Whether this signals the end of the stream */
	done: boolean;
	/** Reasoning/thinking content (DeepSeek thinking models) */
	reasoning?: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	toolCalls?: Array<{
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	}>;
}

/**
 * Abstract base class for providers that support SSE streaming
 * Eliminates ~50 lines of duplicated streaming code per provider
 */
export abstract class BaseStreamingProvider extends BaseLLMProvider {
	/**
	 * A parser for one stream. Called once per request, so any state a parser
	 * accumulates (partial tool calls) belongs to that stream alone.
	 */
	protected abstract createChunkParser(): ChunkParser;

	/**
	 * Get the provider name for logging
	 */
	protected abstract getProviderName(): string;

	/**
	 * Stream chat with SSE infrastructure
	 * Handles all the common streaming logic:
	 * - Fetch setup
	 * - Response validation
	 * - ReadableStream processing
	 * - SSE line parsing
	 * - Buffer management
	 * - Error handling
	 */
	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		const { url, body: requestBody } = this.prepareStreamRequest(request);

		// The streaming transport is separate from the buffered one because only it
		// can expose a live `ReadableStream` (`response.body` below); a buffering
		// transport cannot stream token-by-token by construction.
		let response: Awaited<ReturnType<typeof this.http.stream>>;
		try {
			response = await this.http.stream({
				url,
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(requestBody),
				signal: request.signal,
			});
		} catch (error: unknown) {
			// The endpoint was unreachable over the streaming transport at all --
			// typically an OpenAI-compatible gateway that sends no CORS headers, so a
			// renderer-side request is blocked before any response exists. The
			// buffered transport bypasses CORS, so retry there non-streaming and
			// synthesize the chunks. Only transport failures qualify; HTTP status
			// errors below are not retried, since the buffered path would hit the
			// identical status.
			if (error instanceof StreamTransportUnavailableError) {
				try {
					await this.completeViaBufferedRequest(requestBody as Record<string, unknown>, url, onChunk, request.signal);
					return;
				} catch (fallbackError: unknown) {
					console.error(`[${this.getProviderName()}] buffered fallback failed:`, fallbackError);
					throw fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
				}
			}
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[${this.getProviderName()}] Stream error:`, err);
			throw err;
		}

		try {
			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`API request failed: ${response.status} ${errorText || 'Unknown error'}`);
			}

			// Validate response body exists and is a ReadableStream
			if (!response.body) {
				throw new Error('Response body is null');
			}

			// Process the stream
			await this.processStream(response.body, onChunk, request.signal);

		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[${this.getProviderName()}] Stream error:`, err);
			throw err;
		}
	}

	/**
	 * Non-streaming fallback for endpoints the streaming transport can't reach (no
	 * CORS headers). Re-POSTs the same body with `stream:false` over the buffered,
	 * CORS-exempt transport, then emits the full response through `onChunk` as
	 * synthetic chunks — content, reasoning, and tool_calls — matching the shape the
	 * streaming path produces, so agent mode (tool calls) works unchanged.
	 */
	private async completeViaBufferedRequest(
		streamBody: Record<string, unknown>,
		url: string,
		onChunk: (_chunk: StreamChunk) => void,
		signal?: AbortSignal,
	): Promise<void> {
		const body: Record<string, unknown> = { ...streamBody, stream: false };
		delete body.stream_options;

		const response = (await this.makeRequest(url, body, signal)) as {
			json?: {
				choices?: Array<{ message?: { content?: string | null; reasoning_content?: string; tool_calls?: ParsedStreamChunk['toolCalls'] } }>;
				usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
			};
		};

		const message = response.json?.choices?.[0]?.message ?? {};
		const rawUsage = response.json?.usage;
		const usage = rawUsage
			? {
				promptTokens: rawUsage.prompt_tokens ?? 0,
				completionTokens: rawUsage.completion_tokens ?? 0,
				totalTokens: rawUsage.total_tokens ?? 0,
			}
			: undefined;

		if (message.reasoning_content) {
			onChunk({ content: '', done: false, reasoning: message.reasoning_content });
		}
		if (message.content) {
			onChunk({ content: message.content, done: false });
		}
		if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
			onChunk({ content: '', done: false, toolCalls: message.tool_calls });
		}
		onChunk({ content: '', done: true, usage });
	}

	/**
	 * Prepare the streaming request (URL and body)
	 * Subclasses must implement to provide provider-specific request format
	 */
	protected abstract prepareStreamRequest(_request: ChatRequest): { url: string; body: unknown };

	/**
	 * Process the ReadableStream from the response
	 * This is common SSE processing logic for all providers
	 */
	private async processStream(
		body: ReadableStream<Uint8Array>,
		onChunk: (_chunk: StreamChunk) => void,
		signal?: AbortSignal,
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		const parse = this.createChunkParser();
		let buffer = '';
		const cancel = () => {
			reader.cancel().catch(() => undefined);
		};
		signal?.addEventListener('abort', cancel, { once: true });

		try {
			while (!signal?.aborted) {
				const { done, value } = await reader.read();
				if (done) break;

				// Decode the chunk and add to buffer
				buffer += decoder.decode(value, { stream: true });

				// Split by newlines and process complete lines
				const lines = buffer.split('\n');

				// Keep the last incomplete line in the buffer
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (signal?.aborted) break;
					if (line.startsWith('data: ')) {
						const data = line.slice(6); // Remove 'data: ' prefix

						// Handle [DONE] marker (common in many APIs)
						if (data === '[DONE]') {
							onChunk({ content: '', done: true });
							return;
						}

						// Try to parse and process the JSON
						try {
							const parsed = JSON.parse(data) as Record<string, unknown>;
							const result = parse(parsed);

							if (result) {
								if (result.done) {
									onChunk({ content: '', done: true, usage: result.usage });
									return;
								}

								if (result.toolCalls && result.toolCalls.length > 0) {
									onChunk({ content: '', done: false, toolCalls: result.toolCalls });
								}
								if (result.content || result.reasoning) {
									onChunk({ content: result.content ?? '', done: false, reasoning: result.reasoning, usage: result.usage });
								} else if (result.usage) {
									onChunk({ content: '', done: false, usage: result.usage });
								}
							}
						} catch (e) {
							console.error(`[${this.getProviderName()}] Failed to parse SSE data:`, e);
							// Continue processing other lines even if one fails
						}
					}
				}
			}

			// Stream ended without explicit done signal
			onChunk({ content: '', done: true });

		} finally {
			signal?.removeEventListener('abort', cancel);
			reader.releaseLock();
		}
	}

	/**
	 * Helper method to extract model name from provider-prefixed ID
	 * Common pattern: "provider:model-name" -> "model-name"
	 */
	protected extractModelName(modelId: string): string {
		return modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
	}

	/**
	 * Helper method to get base URL with fallback
	 */
	protected getBaseUrl(defaultUrl: string): string {
		return this.config.baseUrl || defaultUrl;
	}
}
