import { request } from 'node:http';
import {
	DEFAULT_MOCK_LLM_PORT,
	type CapturedLLMCall,
	type QueuedLLMResponse,
} from './mock-llm-server';

function adminJson<T>(method: string, route: string, body?: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: DEFAULT_MOCK_LLM_PORT,
				path: route,
				method,
				headers: payload
					? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
					: undefined,
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => {
					const statusCode = res.statusCode ?? 500;
					if (statusCode >= 400) {
						reject(new Error(`Mock LLM admin ${method} ${route} failed: ${statusCode} ${raw}`));
						return;
					}
					resolve(raw ? JSON.parse(raw) as T : undefined as T);
				});
			}
		);
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function queue(response: QueuedLLMResponse): Promise<void> {
	return adminJson<void>('POST', '/__mock__/queue', response);
}

function chatCompletion(content: string): QueuedLLMResponse {
	return {
		statusCode: 200,
		body: {
			id: 'cmpl_mock',
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: 'gpt-4o-mini',
			choices: [{
				index: 0,
				message: { role: 'assistant', content },
				finish_reason: 'stop',
			}],
			usage: { prompt_tokens: 1, completion_tokens: content.length, total_tokens: content.length + 1 },
		},
	};
}

export const mockLLM = {
	async replyWith(text: string): Promise<void> {
		await queue(chatCompletion(text));
	},

	async toolCall(name: string, args: Record<string, unknown>, id = 'call_mock_1'): Promise<void> {
		await queue({
			statusCode: 200,
			body: {
				id: 'cmpl_tool_mock',
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					message: {
						role: 'assistant',
						content: '',
						tool_calls: [{
							id,
							type: 'function',
							function: { name, arguments: JSON.stringify(args) },
						}],
					},
					finish_reason: 'tool_calls',
				}],
			},
		});
	},

	async streaming(chunks: string[]): Promise<void> {
		await queue({
			statusCode: 200,
			body: null,
			streamChunks: chunks.map((chunk, index) => JSON.stringify({
				id: 'cmpl_stream_mock',
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					delta: { content: chunk },
					finish_reason: index === chunks.length - 1 ? 'stop' : null,
				}],
			})),
		});
	},

	async errorStatus(code: 401 | 429 | 500): Promise<void> {
		await queue({
			statusCode: code,
			body: { error: { message: `Mock LLM error ${code}`, type: 'mock_error', code } },
		});
	},

	async getCalls(): Promise<CapturedLLMCall[]> {
		return adminJson<CapturedLLMCall[]>('GET', '/__mock__/calls');
	},

	async clearAll(): Promise<void> {
		await adminJson<void>('POST', '/__mock__/reset');
	},
};
