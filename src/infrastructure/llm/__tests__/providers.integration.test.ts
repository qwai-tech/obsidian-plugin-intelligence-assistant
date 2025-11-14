/**
 * Provider Integration Tests
 * Tests for all streaming providers using BaseStreamingProvider
 */

import { OpenAIProvider } from '../openai-provider';
import { AnthropicProvider } from '../anthropic-provider';
import { GoogleProvider } from '../google-provider';
import { OpenRouterProvider } from '../openrouter-provider';
import { DeepSeekProvider } from '../deepseek-provider';
import { LLMConfig } from '@/types';
import { ChatRequest } from '@/types';

// Mock global fetch
global.fetch = jest.fn();

describe('Provider Integration Tests', () => {
	const mockConfig: LLMConfig = {
		provider: 'test',
		apiKey: 'test-api-key',
		baseUrl: 'https://test.api.com',
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('OpenAIProvider', () => {
		let provider: OpenAIProvider;

		beforeEach(() => {
			provider = new OpenAIProvider(mockConfig);
		});

		it('should parse standard OpenAI stream chunk', () => {
			const chunk = {
				choices: [
					{
						delta: {
							content: 'Hello world',
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: 'Hello world',
				done: false,
			});
		});

		it('should handle [DONE] marker', () => {
			const result = provider['parseStreamChunk']('[DONE]');

			expect(result).toEqual({
				content: null,
				done: true,
			});
		});

		it('should return null for chunks without content', () => {
			const chunk = {
				choices: [
					{
						delta: {},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should handle missing choices array', () => {
			const chunk = {};
			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should prepare stream request correctly', () => {
			const request: ChatRequest = {
				model: 'openai:gpt-4',
				messages: [{ role: 'user', content: 'Test' }],
				temperature: 0.8,
				maxTokens: 1500,
			};

			const { url, body } = provider['prepareStreamRequest'](request);

			expect(url).toContain('/chat/completions');
			expect(body).toMatchObject({
				model: 'gpt-4',
				messages: request.messages,
				temperature: 0.8,
				stream: true,
			});
		});

		it('should extract model name from provider prefix', () => {
			const modelName = provider['extractModelName']('openai:gpt-4-turbo');
			expect(modelName).toBe('gpt-4-turbo');
		});
	});

	describe('AnthropicProvider', () => {
		let provider: AnthropicProvider;

		beforeEach(() => {
			provider = new AnthropicProvider(mockConfig);
		});

		it('should parse content_block_delta chunks', () => {
			const chunk = {
				type: 'content_block_delta',
				delta: {
					text: 'Hello from claude',
				},
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: 'Hello from Claude',
				done: false,
			});
		});

		it('should handle message_stop', () => {
			const chunk = {
				type: 'message_stop',
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: null,
				done: true,
			});
		});

		it('should return null for other event types', () => {
			const chunk = {
				type: 'message_start',
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should return null for chunks without delta text', () => {
			const chunk = {
				type: 'content_block_delta',
				delta: {},
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should prepare stream request correctly', () => {
			const request: ChatRequest = {
				model: 'anthropic:claude-3-opus',
				messages: [{ role: 'user', content: 'Test' }],
				temperature: 0.7,
				maxTokens: 2000,
			};

			const { url, body } = provider['prepareStreamRequest'](request);

			expect(url).toContain('/messages');
			expect(body).toMatchObject({
				model: 'claude-3-opus',
				messages: request.messages,
				temperature: 0.7,
				max_tokens: 2000,
				stream: true,
			});
		});
	});

	describe('GoogleProvider', () => {
		let provider: GoogleProvider;

		beforeEach(() => {
			provider = new GoogleProvider(mockConfig);
		});

		it('should parse Google stream chunk', () => {
			const chunk = {
				candidates: [
					{
						content: {
							parts: [
								{
									text: 'Hello from gemini',
								},
							],
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: 'Hello from Gemini',
				done: false,
			});
		});

		it('should return null for chunks without content', () => {
			const chunk = {
				candidates: [
					{
						content: {
							parts: [],
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should handle missing candidates', () => {
			const chunk = {};
			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should prepare stream request correctly', () => {
			const request: ChatRequest = {
				model: 'google:gemini-pro',
				messages: [{ role: 'user', content: 'Test' }],
				temperature: 0.9,
				maxTokens: 1000,
			};

			const { url, body } = provider['prepareStreamRequest'](request);

			expect(url).toContain('/models/gemini-pro:streamGenerateContent');
			expect(url).toContain('alt=sse');
			expect(body).toHaveProperty('contents');
			expect(body.generationConfig).toMatchObject({
				temperature: 0.9,
				maxOutputTokens: 1000,
			});
		});

		it('should transform messages for Gemini format', () => {
			const messages: any[] = [
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Hi there' },
			];

			const transformed = (provider as any)['transformMessages'](messages);

			expect(transformed).toEqual([
				{ role: 'user', parts: [{ text: 'Hello' }] },
				{ role: 'model', parts: [{ text: 'Hi there' }] },
			]);
		});
	});

	describe('OpenRouterProvider', () => {
		let provider: OpenRouterProvider;

		beforeEach(() => {
			provider = new OpenRouterProvider(mockConfig);
		});

		it('should parse OpenRouter stream chunk (OpenAI-compatible)', () => {
			const chunk = {
				choices: [
					{
						delta: {
							content: 'Response from OpenRouter',
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: 'Response from OpenRouter',
				done: false,
			});
		});

		it('should handle [DONE] marker', () => {
			const result = provider['parseStreamChunk']('[DONE]');

			expect(result).toEqual({
				content: null,
				done: true,
			});
		});

		it('should return null for empty delta', () => {
			const chunk = {
				choices: [
					{
						delta: {},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should prepare stream request correctly', () => {
			const request: ChatRequest = {
				model: 'openrouter:anthropic/claude-3-opus',
				messages: [{ role: 'user', content: 'Test' }],
				temperature: 0.7,
				maxTokens: 2000,
			};

			const { url, body } = provider['prepareStreamRequest'](request);

			expect(url).toContain('openrouter.ai/api/v1/chat/completions');
			expect(body).toMatchObject({
				model: 'anthropic/claude-3-opus',
				messages: request.messages,
				temperature: 0.7,
				max_tokens: 2000,
				stream: true,
			});
		});

		it('should include OpenRouter-specific headers', () => {
			const headers = provider['getHeaders']();

			expect(headers).toHaveProperty('HTTP-Referer', 'https://obsidian.md');
			expect(headers).toHaveProperty('X-Title', 'Obsidian Intelligence Assistant');
		});
	});

	describe('DeepSeekProvider', () => {
		let provider: DeepSeekProvider;

		beforeEach(() => {
			provider = new DeepSeekProvider(mockConfig);
		});

		it('should parse standard DeepSeek stream chunk', () => {
			const chunk = {
				choices: [
					{
						delta: {
							content: 'Response from DeepSeek',
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: 'Response from DeepSeek',
				done: false,
			});
		});

		it('should handle [DONE] marker', () => {
			const result = provider['parseStreamChunk']('[DONE]');

			expect(result).toEqual({
				content: null,
				done: true,
			});
		});

		it('should handle DeepSeek R1 reasoning_content', () => {
			const chunk = {
				choices: [
					{
						delta: {
							reasoning_content: 'Thinking step...',
							content: '',
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			// Should return empty content (reasoning is provider-specific)
			expect(result).toEqual({
				content: '',
				done: false,
			});
		});

		it('should handle both reasoning and content', () => {
			const chunk = {
				choices: [
					{
						delta: {
							reasoning_content: 'Analyzing...',
							content: 'Answer: 42',
						},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toEqual({
				content: 'Answer: 42',
				done: false,
			});
		});

		it('should return null when no content or reasoning', () => {
			const chunk = {
				choices: [
					{
						delta: {},
					},
				],
			};

			const result = provider['parseStreamChunk'](chunk);

			expect(result).toBeNull();
		});

		it('should prepare stream request correctly', () => {
			const request: ChatRequest = {
				model: 'deepseek:deepseek-chat',
				messages: [{ role: 'user', content: 'Test' }],
				temperature: 0.7,
				maxTokens: 2000,
			};

			const { url, body } = provider['prepareStreamRequest'](request);

			expect(url).toContain('api.deepseek.com/v1/chat/completions');
			expect(body).toMatchObject({
				model: 'deepseek-chat',
				messages: request.messages,
				temperature: 0.7,
				max_tokens: 2000,
				stream: true,
			});
		});
	});

	describe('Cross-Provider Consistency', () => {
		it('all providers should extend BaseStreamingProvider', () => {
			const providers = [
				new OpenAIProvider(mockConfig),
				new AnthropicProvider(mockConfig),
				new GoogleProvider(mockConfig),
				new OpenRouterProvider(mockConfig),
				new DeepSeekProvider(mockConfig),
			];

			providers.forEach((provider) => {
				expect(provider).toHaveProperty('streamChat');
				expect(typeof provider.streamChat).toBe('function');
			});
		});

		it('all providers should implement parseStreamChunk', () => {
			const providers = [
				new OpenAIProvider(mockConfig),
				new AnthropicProvider(mockConfig),
				new GoogleProvider(mockConfig),
				new OpenRouterProvider(mockConfig),
				new DeepSeekProvider(mockConfig),
			];

			providers.forEach((provider) => {
				expect((provider as any)['parseStreamChunk']).toBeDefined();
				expect(typeof (provider as any)['parseStreamChunk']).toBe('function');
			});
		});

		it('all providers should implement prepareStreamRequest', () => {
			const providers = [
				new OpenAIProvider(mockConfig),
				new AnthropicProvider(mockConfig),
				new GoogleProvider(mockConfig),
				new OpenRouterProvider(mockConfig),
				new DeepSeekProvider(mockConfig),
			];

			providers.forEach((provider) => {
				expect((provider as any)['prepareStreamRequest']).toBeDefined();
				expect(typeof (provider as any)['prepareStreamRequest']).toBe('function');
			});
		});

		it('all providers should implement getProviderName', () => {
			const providers = [
				{ provider: new OpenAIProvider(mockConfig), expectedName: 'OpenAI' },
				{ provider: new AnthropicProvider(mockConfig), expectedName: 'Anthropic' },
				{ provider: new GoogleProvider(mockConfig), expectedName: 'Google' },
				{ provider: new OpenRouterProvider(mockConfig), expectedName: 'OpenRouter' },
				{ provider: new DeepSeekProvider(mockConfig), expectedName: 'DeepSeek' },
			];

			providers.forEach(({ provider, expectedName }) => {
				expect((provider as any)['getProviderName']()).toBe(expectedName);
			});
		});

		it('all providers should extract model names correctly', () => {
			const providers = [
				new OpenAIProvider(mockConfig),
				new AnthropicProvider(mockConfig),
				new GoogleProvider(mockConfig),
				new OpenRouterProvider(mockConfig),
				new DeepSeekProvider(mockConfig),
			];

			providers.forEach((provider) => {
				const extracted = provider['extractModelName']('provider:model-name');
				expect(extracted).toBe('model-name');
			});
		});

		it('all providers should support custom base URLs', () => {
			const customConfig: LLMConfig = {
				...mockConfig,
				baseUrl: 'https://custom.api.com',
			};

			const providers = [
				new OpenAIProvider(customConfig),
				new AnthropicProvider(customConfig),
				new GoogleProvider(customConfig),
				new OpenRouterProvider(customConfig),
				new DeepSeekProvider(customConfig),
			];

			providers.forEach((provider) => {
				const baseUrl = provider['getBaseUrl']('https://default.com');
				expect(baseUrl).toBe('https://custom.api.com');
			});
		});
	});

	describe('Error Handling Consistency', () => {
		it('all providers should handle malformed chunks gracefully', () => {
			const providers = [
				new OpenAIProvider(mockConfig),
				new AnthropicProvider(mockConfig),
				new GoogleProvider(mockConfig),
				new OpenRouterProvider(mockConfig),
				new DeepSeekProvider(mockConfig),
			];

			const malformedChunk = { random: 'data' };

			providers.forEach((provider) => {
				// Should not throw, just return null
				expect(() => (provider as any)['parseStreamChunk'](malformedChunk)).not.toThrow();
				expect((provider as any)['parseStreamChunk'](malformedChunk)).toBeNull();
			});
		});

		it('all providers should handle null/undefined chunks', () => {
			const providers = [
				new OpenAIProvider(mockConfig),
				new AnthropicProvider(mockConfig),
				new GoogleProvider(mockConfig),
				new OpenRouterProvider(mockConfig),
				new DeepSeekProvider(mockConfig),
			];

			providers.forEach((provider) => {
				expect(() => (provider as any)['parseStreamChunk'](null)).not.toThrow();
				expect(() => (provider as any)['parseStreamChunk'](undefined)).not.toThrow();
			});
		});
	});

	describe('Real-World Scenarios', () => {
		it('should handle typical OpenAI streaming response', () => {
			const provider = new OpenAIProvider(mockConfig);
			const chunks = [
				{ choices: [{ delta: { content: 'The' } }] },
				{ choices: [{ delta: { content: ' answer' } }] },
				{ choices: [{ delta: { content: ' is' } }] },
				{ choices: [{ delta: { content: ' 42' } }] },
				{ choices: [{ delta: {} }] }, // Empty delta (role or finish_reason)
			];

			const results = chunks.map(chunk => provider['parseStreamChunk'](chunk));

			expect(results[0]).toEqual({ content: 'The', done: false });
			expect(results[1]).toEqual({ content: ' answer', done: false });
			expect(results[2]).toEqual({ content: ' is', done: false });
			expect(results[3]).toEqual({ content: ' 42', done: false });
			expect(results[4]).toBeNull();
		});

		it('should handle typical Anthropic streaming response', () => {
			const provider = new AnthropicProvider(mockConfig);
			const chunks = [
				{ type: 'message_start' },
				{ type: 'content_block_start' },
				{ type: 'content_block_delta', delta: { text: 'Hello' } },
				{ type: 'content_block_delta', delta: { text: ' world' } },
				{ type: 'content_block_stop' },
				{ type: 'message_stop' },
			];

			const results = chunks.map(chunk => provider['parseStreamChunk'](chunk));

			expect(results[0]).toBeNull(); // message_start
			expect(results[1]).toBeNull(); // content_block_start
			expect(results[2]).toEqual({ content: 'Hello', done: false });
			expect(results[3]).toEqual({ content: ' world', done: false });
			expect(results[4]).toBeNull(); // content_block_stop
			expect(results[5]).toEqual({ content: null, done: true });
		});

		it('should handle DeepSeek R1 reasoning mode', () => {
			const provider = new DeepSeekProvider(mockConfig);
			const chunks = [
				{ choices: [{ delta: { reasoning_content: 'Let me think...' } }] },
				{ choices: [{ delta: { reasoning_content: 'The answer requires...' } }] },
				{ choices: [{ delta: { content: 'The final answer is 42' } }] },
			];

			const results = chunks.map(chunk => provider['parseStreamChunk'](chunk));

			// Reasoning content is detected but returns empty content
			expect(results[0]).toEqual({ content: '', done: false });
			expect(results[1]).toEqual({ content: '', done: false });
			expect(results[2]).toEqual({ content: 'The final answer is 42', done: false });
		});
	});
});
