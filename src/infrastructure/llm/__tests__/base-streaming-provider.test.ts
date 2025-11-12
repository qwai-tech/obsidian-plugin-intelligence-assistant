/**
 * BaseStreamingProvider Tests
 * Comprehensive test suite for common SSE streaming infrastructure
 */

import { BaseStreamingProvider, ParsedStreamChunk } from '../base-streaming-provider';
import { ChatRequest, ChatResponse, StreamChunk } from '@/types';
import { LLMConfig } from '@/types';

/**
 * Concrete test implementation of BaseStreamingProvider
 */
class TestStreamingProvider extends BaseStreamingProvider {
	// Track calls for testing
	public parseStreamChunkCalls: any[] = [];
	public prepareStreamRequestCalls: ChatRequest[] = [];

	// Allow customization of behavior
	public mockParseResult: ParsedStreamChunk | null = { content: 'test', done: false };
	public mockStreamUrl: string = 'https://test.api.com/stream';
	public mockStreamBody: any = { test: true };
	private mockParseChunkImplementation?: (data: any) => ParsedStreamChunk | null;

	get name(): string {
		return 'TestProvider';
	}

	protected getProviderName(): string {
		return 'TestProvider';
	}

	// Make parseStreamChunk public for testing and allow override
	public parseStreamChunk(data: any): ParsedStreamChunk | null {
		this.parseStreamChunkCalls.push(data);
		if (this.mockParseChunkImplementation) {
			return this.mockParseChunkImplementation(data);
		}
		return this.mockParseResult;
	}

	// Allow tests to override parseStreamChunk behavior
	public setParseChunkImplementation(impl: (data: any) => ParsedStreamChunk | null): void {
		this.mockParseChunkImplementation = impl;
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: any } {
		this.prepareStreamRequestCalls.push(request);
		return { url: this.mockStreamUrl, body: this.mockStreamBody };
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		return {
			content: 'Test response',
			usage: {
				promptTokens: 10,
				completionTokens: 20,
				totalTokens: 30,
			},
		};
	}
}

// Mock global fetch
global.fetch = jest.fn();

// Helper to create a mock ReadableStream
function createMockStream(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let index = 0;

	return new ReadableStream({
		pull(controller) {
			if (index < lines.length) {
				controller.enqueue(encoder.encode(lines[index] + '\n'));
				index++;
			} else {
				controller.close();
			}
		},
	});
}

describe('BaseStreamingProvider', () => {
	let provider: TestStreamingProvider;
	let mockConfig: LLMConfig;

	beforeEach(() => {
		mockConfig = {
			provider: 'test',
			apiKey: 'test-key',
			baseUrl: 'https://test.api.com',
		};

		provider = new TestStreamingProvider(mockConfig);
		provider.parseStreamChunkCalls = [];
		provider.prepareStreamRequestCalls = [];

		jest.clearAllMocks();
	});

	describe('streamChat', () => {
		it('should successfully stream chat with valid response', async () => {
			const chunks: StreamChunk[] = [];

			// Mock successful streaming response
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {"content": "Hello"}',
					'data: {"content": " world"}',
					'data: [DONE]',
				]),
			});

			provider.mockParseResult = { content: 'chunk', done: false };

			const request: ChatRequest = {
				model: 'test:gpt-4',
				messages: [{ role: 'user', content: 'Hello' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			expect(chunks.length).toBeGreaterThan(0);
			expect(provider.prepareStreamRequestCalls).toHaveLength(1);
		});

		it('should call prepareStreamRequest with correct request', async () => {
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream(['data: [DONE]']),
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
				temperature: 0.7,
				maxTokens: 1000,
			};

			await provider.streamChat(request, jest.fn());

			expect(provider.prepareStreamRequestCalls).toContainEqual(request);
		});

		it('should throw error on non-OK response', async () => {
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => 'Unauthorized',
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await expect(provider.streamChat(request, jest.fn())).rejects.toThrow(
				'API request failed: 401 Unauthorized'
			);
		});

		it('should throw error when response body is null', async () => {
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: null,
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await expect(provider.streamChat(request, jest.fn())).rejects.toThrow(
				'Response body is null'
			);
		});

		it('should include correct headers in fetch call', async () => {
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream(['data: [DONE]']),
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, jest.fn());

			expect(global.fetch).toHaveBeenCalledWith(
				'https://test.api.com/stream',
				expect.objectContaining({
					method: 'POST',
					headers: expect.any(Object),
					body: expect.any(String),
				})
			);
		});
	});

	describe('SSE Stream Processing', () => {
		it('should parse SSE data lines correctly', async () => {
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {"chunk": 1}',
					'data: {"chunk": 2}',
					'data: [DONE]',
				]),
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, jest.fn());

			expect(provider.parseStreamChunkCalls).toHaveLength(2);
			expect(provider.parseStreamChunkCalls[0]).toEqual({ chunk: 1 });
			expect(provider.parseStreamChunkCalls[1]).toEqual({ chunk: 2 });
		});

		it('should handle [DONE] marker', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream(['data: [DONE]']),
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			expect(chunks).toContainEqual({ content: '', done: true });
		});

		it('should handle done signal from parseStreamChunk', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream(['data: {"type": "stop"}']),
			});

			provider.mockParseResult = { content: null, done: true };

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			expect(chunks).toContainEqual({ content: '', done: true });
		});

		it('should emit content chunks from parseStreamChunk', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {"text": "Hello"}',
					'data: {"text": " world"}',
					'data: [DONE]',
				]),
			});

			let callCount = 0;
			provider.setParseChunkImplementation((data: any): ParsedStreamChunk | null => {
				callCount++;
				if (callCount === 1) return { content: 'Hello', done: false };
				if (callCount === 2) return { content: ' world', done: false };
				return null;
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			expect(chunks).toContainEqual({ content: 'Hello', done: false });
			expect(chunks).toContainEqual({ content: ' world', done: false });
		});

		it('should skip chunks when parseStreamChunk returns null', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {"type": "ping"}',
					'data: {"text": "content"}',
					'data: [DONE]',
				]),
			});

			let callCount = 0;
			provider.setParseChunkImplementation((data: any): ParsedStreamChunk | null => {
				callCount++;
				if (callCount === 1) return null; // Skip ping
				if (callCount === 2) return { content: 'content', done: false };
				return null;
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			// Should only have content chunk and done chunk, not ping
			const contentChunks = chunks.filter(c => c.content && !c.done);
			expect(contentChunks).toHaveLength(1);
		});

		it('should handle malformed JSON gracefully', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {invalid json}',
					'data: {"valid": "json"}',
					'data: [DONE]',
				]),
			});

			provider.mockParseResult = { content: 'valid', done: false };

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			// Should not throw, just log error
			await expect(
				provider.streamChat(request, (chunk) => {
					chunks.push(chunk);
				})
			).resolves.not.toThrow();

			// Should still process valid chunks
			expect(provider.parseStreamChunkCalls.length).toBeGreaterThan(0);
		});

		it('should handle incomplete SSE lines (buffer management)', async () => {
			const encoder = new TextEncoder();
			let callIndex = 0;

			const partialStream = new ReadableStream({
				pull(controller) {
					if (callIndex === 0) {
						// Send partial line
						controller.enqueue(encoder.encode('data: {"partial"'));
						callIndex++;
					} else if (callIndex === 1) {
						// Complete the line
						controller.enqueue(encoder.encode(': true}\n'));
						callIndex++;
					} else if (callIndex === 2) {
						controller.enqueue(encoder.encode('data: [DONE]\n'));
						callIndex++;
					} else {
						controller.close();
					}
				},
			});

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: partialStream,
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, jest.fn());

			// Should have parsed the complete JSON after buffering
			expect(provider.parseStreamChunkCalls).toContainEqual({ partial: true });
		});

		it('should emit done when stream ends without explicit signal', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream(['data: {"text": "content"}']),
			});

			provider.mockParseResult = { content: 'content', done: false };

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			// Should have automatic done at end
			const lastChunk = chunks[chunks.length - 1];
			expect(lastChunk.done).toBe(true);
		});
	});

	describe('Helper Methods', () => {
		describe('extractModelName', () => {
			it('should extract model name from provider-prefixed ID', () => {
				expect(provider['extractModelName']('openai:gpt-4')).toBe('gpt-4');
			});

			it('should handle multiple colons', () => {
				expect(provider['extractModelName']('provider:model:version')).toBe('model:version');
			});

			it('should return original if no colon', () => {
				expect(provider['extractModelName']('gpt-4')).toBe('gpt-4');
			});

			it('should handle empty string', () => {
				expect(provider['extractModelName']('')).toBe('');
			});
		});

		describe('getBaseUrl', () => {
			it('should return config baseUrl if set', () => {
				provider['config'].baseUrl = 'https://custom.api.com';
				expect(provider['getBaseUrl']('https://default.api.com')).toBe('https://custom.api.com');
			});

			it('should return default URL if config baseUrl not set', () => {
				expect(provider['getBaseUrl']('https://default.api.com')).toBe('https://default.api.com');
			});

			it('should return default URL if config baseUrl is empty', () => {
				provider['config'].baseUrl = '';
				expect(provider['getBaseUrl']('https://default.api.com')).toBe('https://default.api.com');
			});

			it('should return default URL if config baseUrl is undefined', () => {
				provider['config'].baseUrl = undefined;
				expect(provider['getBaseUrl']('https://default.api.com')).toBe('https://default.api.com');
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty stream', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([]),
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			// Should emit done at end
			expect(chunks).toContainEqual({ content: '', done: true });
		});

		it('should handle lines without "data: " prefix', async () => {
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					': comment line',
					'event: message',
					'data: {"content": "text"}',
					'data: [DONE]',
				]),
			});

			provider.mockParseResult = { content: 'text', done: false };

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, jest.fn());

			// Should only parse the data line
			expect(provider.parseStreamChunkCalls).toHaveLength(1);
		});

		it('should handle chunks with empty content', async () => {
			const chunks: StreamChunk[] = [];

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {"delta": {}}',
					'data: [DONE]',
				]),
			});

			provider.setParseChunkImplementation((data: any): ParsedStreamChunk | null => {
				// Simulate empty delta (no content)
				return { content: '', done: false };
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			// Empty content chunks should not be emitted
			const contentChunks = chunks.filter(c => c.content && !c.done);
			expect(contentChunks).toHaveLength(0);
		});

		it('should handle rapid successive chunks', async () => {
			const chunks: StreamChunk[] = [];
			const manyLines = Array.from({ length: 100 }, (_, i) => `data: {"index": ${i}}`);
			manyLines.push('data: [DONE]');

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream(manyLines),
			});

			provider.mockParseResult = { content: 'chunk', done: false };

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, (chunk) => {
				chunks.push(chunk);
			});

			// Should have parsed all 100 chunks
			expect(provider.parseStreamChunkCalls).toHaveLength(100);
		});

		it('should log errors for malformed JSON but continue processing', async () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: createMockStream([
					'data: {bad}',
					'data: {"good": true}',
					'data: [DONE]',
				]),
			});

			provider.mockParseResult = { content: 'good', done: false };

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await provider.streamChat(request, jest.fn());

			// Should have logged error
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('[TestProvider] Failed to parse SSE data:'),
				expect.any(Error)
			);

			// But should still have parsed the good chunk
			expect(provider.parseStreamChunkCalls).toContainEqual({ good: true });

			consoleSpy.mockRestore();
		});
	});

	describe('Error Handling', () => {
		it('should handle fetch errors', async () => {
			(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			await expect(provider.streamChat(request, jest.fn())).rejects.toThrow('Network error');
		});

		it('should log stream errors with provider name', async () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
			const testError = new Error('Test error');

			(global.fetch as jest.Mock).mockRejectedValue(testError);

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			try {
				await provider.streamChat(request, jest.fn());
			} catch (e) {
				// Expected
			}

			expect(consoleSpy).toHaveBeenCalledWith(
				'[TestProvider] Stream error:',
				testError
			);

			consoleSpy.mockRestore();
		});

		it('should release reader lock even on error', async () => {
			const mockReader = {
				read: jest.fn()
					.mockResolvedValueOnce({ done: false, value: new Uint8Array([]) })
					.mockRejectedValue(new Error('Read error')),
				releaseLock: jest.fn(),
			};

			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				body: {
					getReader: () => mockReader,
				},
			});

			const request: ChatRequest = {
				model: 'test:model',
				messages: [{ role: 'user', content: 'Test' }],
			};

			try {
				await provider.streamChat(request, jest.fn());
			} catch (e) {
				// Expected
			}

			expect(mockReader.releaseLock).toHaveBeenCalled();
		});
	});
});
