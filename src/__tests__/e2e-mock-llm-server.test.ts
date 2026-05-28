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
		req.on('error', reject);
		if (payload) req.write(payload);
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
});
