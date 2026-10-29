import { withResilience } from '../resilient-http';
import { StreamTransportUnavailableError, type HttpPort, type HttpResponse } from '../http';

const response = (status: number): HttpResponse => ({ status, ok: status < 400, text: '', json: undefined, headers: {} });

const fakePort = (behaviours: Array<() => Promise<HttpResponse>>): HttpPort & { calls: number } => {
	const port = {
		calls: 0,
		request: jest.fn(async () => {
			const next = behaviours[Math.min(port.calls, behaviours.length - 1)];
			port.calls++;
			return await next();
		}),
		stream: jest.fn(),
	};
	return port as unknown as HttpPort & { calls: number };
};

const noDelay = { sleep: async () => undefined };

describe('withResilience', () => {
	it('retries a retryable status and returns the eventual success', async () => {
		const port = fakePort([async () => response(503), async () => response(200)]);

		const result = await withResilience(port, { retries: 2, ...noDelay }).request({ url: 'https://x' });

		expect(result.status).toBe(200);
		expect(port.calls).toBe(2);
	});

	it('retries a network failure', async () => {
		const port = fakePort([async () => { throw new StreamTransportUnavailableError('reset'); }, async () => response(200)]);

		const result = await withResilience(port, { retries: 1, ...noDelay }).request({ url: 'https://x' });

		expect(result.ok).toBe(true);
	});

	it('does not retry a client error', async () => {
		const port = fakePort([async () => response(400)]);

		const result = await withResilience(port, { retries: 3, ...noDelay }).request({ url: 'https://x' });

		expect(result.status).toBe(400);
		expect(port.calls).toBe(1);
	});

	it('gives up after the configured retries and returns the last response', async () => {
		const port = fakePort([async () => response(429)]);

		const result = await withResilience(port, { retries: 2, ...noDelay }).request({ url: 'https://x' });

		expect(result.status).toBe(429);
		expect(port.calls).toBe(3);
	});

	it('rejects with a timeout when the request takes too long', async () => {
		const port = fakePort([() => new Promise<HttpResponse>(() => undefined)]);

		await expect(withResilience(port, { timeoutMs: 10, retries: 0 }).request({ url: 'https://x' }))
			.rejects.toThrow('timed out after 10 ms');
	});

	it('rejects at once when the signal is already aborted, without calling the transport', async () => {
		const port = fakePort([async () => response(200)]);
		const controller = new AbortController();
		controller.abort();

		await expect(withResilience(port).request({ url: 'https://x', signal: controller.signal })).rejects.toThrow('aborted');
		expect(port.calls).toBe(0);
	});

	it('rejects when the signal aborts mid-request', async () => {
		const port = fakePort([() => new Promise<HttpResponse>(() => undefined)]);
		const controller = new AbortController();

		const pending = withResilience(port, { retries: 0 }).request({ url: 'https://x', signal: controller.signal });
		controller.abort();

		await expect(pending).rejects.toThrow('aborted');
	});
});
