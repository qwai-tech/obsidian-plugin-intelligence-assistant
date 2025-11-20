/**
 * Base Streaming Provider
 * Provides common SSE streaming infrastructure for all LLM providers
 */

import { BaseLLMProvider } from './base-provider';
import { ChatRequest, StreamChunk } from './types';

/**
 * Result of parsing a streaming chunk
 */
export interface ParsedStreamChunk {
	/** Text content extracted from the chunk */
	content: string | null;
	/** Whether this signals the end of the stream */
	done: boolean;
}

/**
 * Abstract base class for providers that support SSE streaming
 * Eliminates ~50 lines of duplicated streaming code per provider
 */
export abstract class BaseStreamingProvider extends BaseLLMProvider {
	/**
	 * Parse a JSON chunk from the stream
	 * Each provider has different JSON structure, so this must be implemented
	 *
	 * @param data The parsed JSON object from the stream
	 * @returns Parsed content and done status, or null if chunk should be ignored
	 *
	 * @example OpenAI
	 * ```ts
	 * protected parseStreamChunk(_data: unknown): ParsedStreamChunk | null {
	 *   if (_data === '[DONE]') return { content: null, done: true };
	 *   const content = _data.choices[0]?.delta?.content;
	 *   return content ? { content, done: false } : null;
	 * }
	 * ```
	 *
	 * @example Anthropic
	 * ```ts
	 * protected parseStreamChunk(_data: unknown): ParsedStreamChunk | null {
	 *   if (_data.type === 'message_stop') return { content: null, done: true };
	 *   if (_data.type === 'content_block_delta') {
	 *     const content = _data.delta?.text;
	 *     return content ? { content, done: false } : null;
	 *   }
	 *   return null;
	 * }
	 * ```
	 */
	protected abstract parseStreamChunk(_data: unknown): ParsedStreamChunk | null;

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

		try {
			// eslint-disable-next-line no-restricted-globals -- requestUrl cannot stream SSE responses
			const response = await fetch(url, {
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`API request failed: ${response.status} ${errorText || 'Unknown error'}`);
			}

			// Validate response body exists and is a ReadableStream
			if (!response.body) {
				throw new Error('Response body is null');
			}

			// Process the stream
			await this.processStream(response.body, onChunk);

		} catch (error: unknown) {
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error(`[${this.getProviderName()}] Stream error:`, err);
			throw err;
		}
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
		onChunk: (_chunk: StreamChunk) => void
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				// Decode the chunk and add to buffer
				buffer += decoder.decode(value, { stream: true });

				// Split by newlines and process complete lines
				const lines = buffer.split('\n');

				// Keep the last incomplete line in the buffer
				buffer = lines.pop() || '';

				// Process each complete line
				for (const line of lines) {
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
							const result = this.parseStreamChunk(parsed);

							if (result) {
								if (result.done) {
									onChunk({ content: '', done: true });
									return;
								}

								if (result.content) {
									onChunk({ content: result.content, done: false });
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
