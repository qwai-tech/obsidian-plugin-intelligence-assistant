/**
 * Mock AI API responses for CI E2E testing.
 * Injects browser.mock() calls to intercept LLM API requests.
 */
import fs from 'fs';
import path from 'path';

const MOCK_DIR = path.join(__dirname, '..', 'mocks', 'responses');

function readFixture(name: string): string {
	return fs.readFileSync(path.join(MOCK_DIR, name), 'utf-8');
}

/** Mock the OpenAI chat completions endpoint with a simple text reply. */
export function mockOpenAISimpleReply(): void {
	browser.mock('**/v1/chat/completions', {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: readFixture('chat-simple-reply.json'),
	});
}

/** Mock the OpenAI endpoint to return a tool call response. */
export function mockOpenAIToolCall(): void {
	browser.mock('**/v1/chat/completions', {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: readFixture('chat-tool-call.json'),
	});
}

/** Mock the OpenAI endpoint to return a tool result follow-up. */
export function mockOpenAIToolResult(): void {
	browser.mock('**/v1/chat/completions', {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: readFixture('chat-tool-result.json'),
	});
}

/** Mock the OpenAI endpoint for streaming (SSE) responses. */
export function mockOpenAIStreaming(): void {
	browser.mock('**/v1/chat/completions', {
		statusCode: 200,
		headers: { 'content-type': 'text/event-stream' },
		body: readFixture('chat-streaming-reply.txt'),
	});
}

/** Mock the Anthropic messages endpoint. */
export function mockAnthropicReply(): void {
	browser.mock('**/v1/messages', {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			id: 'msg_mock_001',
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'Hello from Claude! How can I help?' }],
			model: 'claude-sonnet-4-20250514',
			stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 12 },
		}),
	});
}

/** Mock the models list endpoint. */
export function mockModelsList(): void {
	browser.mock('**/v1/models', {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: readFixture('models-list.json'),
	});
}

/** Mock an API error (rate limit or server error). */
export function mockLLMError(statusCode: 429 | 500): void {
	browser.mock('**/v1/chat/completions', {
		statusCode,
		headers: { 'content-type': 'application/json' },
		body: readFixture(statusCode === 429 ? 'chat-error-429.json' : 'chat-error-500.json'),
	});
}

/** Remove all active mocks. */
export function clearMocks(): void {
	browser.throttle('off');
}
