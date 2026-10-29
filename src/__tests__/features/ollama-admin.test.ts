import { OllamaAdmin } from '@/features/llm/ollama-admin';
import type { HttpPort, HttpRequest, HttpResponse } from '@qwai/obsidian-llm';

const portReplying = (status: number, json: unknown = undefined, text = '') => {
	const requests: HttpRequest[] = [];
	const port = {
		request: jest.fn(async (req: HttpRequest): Promise<HttpResponse> => {
			requests.push(req);
			return { status, ok: status < 300, json, text, headers: {} };
		}),
		stream: jest.fn(),
	} as unknown as HttpPort;
	return { port, requests };
};

describe('OllamaAdmin', () => {
	it('reports an online server with its version', async () => {
		const { port, requests } = portReplying(200, { version: '0.5.1' });

		expect(await new OllamaAdmin(port).status('http://localhost:11434/')).toEqual({ online: true, version: '0.5.1' });
		expect(requests[0]).toMatchObject({ url: 'http://localhost:11434/api/version', method: 'GET' });
	});

	it('reports an unreachable server as offline', async () => {
		const port = { request: jest.fn(async () => { throw new Error('ECONNREFUSED'); }), stream: jest.fn() } as unknown as HttpPort;

		expect(await new OllamaAdmin(port).status('http://localhost:11434')).toEqual({ online: false });
	});

	it('pulls a model with a long timeout', async () => {
		const { port, requests } = portReplying(200);

		await new OllamaAdmin(port).pull('http://localhost:11434', 'llama3');

		expect(requests[0]).toMatchObject({ url: 'http://localhost:11434/api/pull', method: 'POST', body: '{"name":"llama3"}' });
		expect(requests[0].timeoutMs).toBeGreaterThanOrEqual(30 * 60_000);
	});

	it('throws the server message when a delete fails', async () => {
		const { port } = portReplying(404, undefined, 'model not found');

		await expect(new OllamaAdmin(port).remove('http://localhost:11434', 'ghost')).rejects.toThrow('model not found');
	});
});
