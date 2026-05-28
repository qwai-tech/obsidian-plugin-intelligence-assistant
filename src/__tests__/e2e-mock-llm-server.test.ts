import { request } from 'node:http';
import {
	DEFAULT_MOCK_LLM_PORT,
	createMockLLMServer,
	type MockLLMServer,
} from '../../tests/e2e/support/mock-llm-server';

function httpJson<T>(method: string, path: string, body?: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: DEFAULT_MOCK_LLM_PORT,
				path,
				method,
				agent: false,
				headers: payload
					? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
					: undefined,
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => {
					if ((res.statusCode ?? 500) >= 400) {
						reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
						return;
					}
					resolve(raw ? JSON.parse(raw) as T : undefined as T);
				});
			}
		);
		req.on('error', (error) => reject(new Error(`${method} ${path}: ${error.message}`)));
		if (payload) req.write(payload);
		req.end();
	});
}

function httpText(method: string, path: string, body?: unknown): Promise<{ headers: Record<string, string | string[] | undefined>; text: string }> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: DEFAULT_MOCK_LLM_PORT,
				path,
				method,
				agent: false,
				headers: payload
					? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
					: undefined,
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => {
					if ((res.statusCode ?? 500) >= 400) {
						reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
						return;
					}
					resolve({ headers: res.headers, text: raw });
				});
			}
		);
		req.on('error', (error) => reject(new Error(`${method} ${path}: ${error.message}`)));
		if (payload) req.write(payload);
		req.end();
	});
}

async function timedHttpText(method: string, path: string, body?: unknown): Promise<{ elapsedMs: number; text: string }> {
	const startedAt = Date.now();
	const response = await httpText(method, path, body);
	return { elapsedMs: Date.now() - startedAt, text: response.text };
}

function httpRaw(method: string, path: string): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; text: string }> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: '127.0.0.1',
				port: DEFAULT_MOCK_LLM_PORT,
				path,
				method,
				agent: false,
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => {
					resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, text: raw });
				});
			}
		);
		req.on('error', (error) => reject(new Error(`${method} ${path}: ${error.message}`)));
		req.end();
	});
}

describe('mock LLM server', () => {
	let server: MockLLMServer;

	beforeEach(async () => {
		server = createMockLLMServer({ port: DEFAULT_MOCK_LLM_PORT });
		await server.start();
		await httpJson('POST', '/__mock__/reset');
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns queued chat responses and captures requests', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: {
				id: 'cmpl_mock',
				object: 'chat.completion',
				created: 1,
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					message: { role: 'assistant', content: 'pong' },
					finish_reason: 'stop',
				}],
			},
		});

		const response = await httpJson<{ choices: Array<{ message: { content: string } }> }>(
			'POST',
			'/v1/chat/completions',
			{ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }] }
		);
		const calls = await httpJson<Array<{ path: string; body: { model: string } }>>('GET', '/__mock__/calls');

		expect(response.choices[0].message.content).toBe('pong');
		expect(calls).toHaveLength(1);
		expect(calls[0].path).toBe('/v1/chat/completions');
		expect(calls[0].body.model).toBe('gpt-4o-mini');
	});

	it('allows browser CORS preflight for chat completions', async () => {
		const response = await httpRaw('OPTIONS', '/v1/chat/completions');

		expect(response.statusCode).toBe(204);
		expect(response.headers['access-control-allow-origin']).toBe('*');
		expect(String(response.headers['access-control-allow-headers'])).toContain('authorization');
		expect(String(response.headers['access-control-allow-methods'])).toContain('POST');
	});

	it('returns queued OpenAI-compatible model lists and captures requests', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: {
				object: 'list',
				data: [
					{ id: 'gpt-4o-refresh-a', object: 'model' },
					{ id: 'gpt-4o-refresh-b', object: 'model' },
				],
			},
		});

		const response = await httpJson<{ data: Array<{ id: string }> }>('GET', '/v1/models');
		const calls = await httpJson<Array<{ path: string; method: string }>>('GET', '/__mock__/calls');

		expect(response.data.map(model => model.id)).toEqual(['gpt-4o-refresh-a', 'gpt-4o-refresh-b']);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ method: 'GET', path: '/v1/models' });
	});

	it('converts queued chat completions into OpenAI SSE for streaming requests', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: {
				id: 'cmpl_mock_stream',
				object: 'chat.completion',
				created: 1,
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					message: { role: 'assistant', content: 'pong' },
					finish_reason: 'stop',
				}],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			},
		});

		const response = await httpText(
			'POST',
			'/v1/chat/completions',
			{ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], stream: true }
		);
		const events = response.text
			.split('\n')
			.filter((line) => line.startsWith('data: '))
			.map((line) => line.slice('data: '.length));
		const chunks = events
			.filter((line) => line !== '[DONE]')
			.map((line) => JSON.parse(line) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>; usage?: { total_tokens?: number } });

		expect(String(response.headers['content-type'])).toContain('text/event-stream');
		expect(chunks[0].choices?.[0].delta?.content).toBe('pong');
		expect(chunks.some((chunk) => chunk.usage?.total_tokens === 2)).toBe(true);
		expect(events.at(-1)).toBe('[DONE]');
	});

	it('supports delayed explicit streaming chunks', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: null,
			streamChunkDelayMs: 40,
			streamChunks: ['one', 'two'],
		});

		const response = await timedHttpText(
			'POST',
			'/v1/chat/completions',
			{ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], stream: true }
		);

		expect(response.elapsedMs).toBeGreaterThanOrEqual(35);
		expect(response.text).toContain('data: one');
		expect(response.text).toContain('data: two');
		expect(response.text).toContain('data: [DONE]');
	});

});
