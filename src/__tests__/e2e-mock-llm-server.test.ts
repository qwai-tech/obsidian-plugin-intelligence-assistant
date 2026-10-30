import { request } from 'node:http';
import {
	createMockLLMServer,
	type MockLLMServer,
} from '../../tests/e2e/support/mock-llm-server';

let server: MockLLMServer;

function httpJson<T>(method: string, path: string, body?: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: server.port(),
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
				port: server.port(),
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
				port: server.port(),
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

function openStream(path: string, body: unknown): { received: () => string; done: Promise<string> } {
	let raw = '';
	const done = new Promise<string>((resolve, reject) => {
		const payload = JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: server.port(),
				path,
				method: 'POST',
				agent: false,
				headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
			},
			(res) => {
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => resolve(raw));
			}
		);
		req.on('error', reject);
		req.write(payload);
		req.end();
	});
	return { received: () => raw, done };
}

async function waitFor(condition: () => boolean): Promise<void> {
	while (!condition()) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

describe('mock LLM server', () => {
	beforeEach(async () => {
		server = createMockLLMServer({ port: 0 });
		await server.start();
		await httpJson('POST', '/__mock__/reset');
	});

	afterEach(async () => {
		await server.stop();
	});

	it('binds a free port of its own when asked for port 0', async () => {
		const other = createMockLLMServer({ port: 0 });
		await other.start();
		try {
			expect(other.port()).toBeGreaterThan(0);
			expect(other.port()).not.toBe(server.port());
		} finally {
			await other.stop();
		}
	});

	it('reports no port once stopped', async () => {
		await server.stop();
		expect(() => server.port()).toThrow('Server is not running.');
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

	it('holds a stream after the given chunk until released', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: null,
			streamHoldAfter: 1,
			streamChunks: ['one', 'two'],
		});

		const stream = openStream('/v1/chat/completions', { model: 'gpt-4o-mini', messages: [], stream: true });
		await waitFor(() => stream.received().includes('data: one'));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(stream.received()).not.toContain('data: two');

		await httpJson('POST', '/__mock__/release');

		const text = await stream.done;
		expect(text).toContain('data: two');
		expect(text).toContain('data: [DONE]');
	});

	it('releases held streams on reset', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: null,
			streamHoldAfter: 1,
			streamChunks: ['one', 'two'],
		});

		const stream = openStream('/v1/chat/completions', { model: 'gpt-4o-mini', messages: [], stream: true });
		await waitFor(() => stream.received().includes('data: one'));
		await httpJson('POST', '/__mock__/reset');

		expect(await stream.done).toContain('data: [DONE]');
	});

});
