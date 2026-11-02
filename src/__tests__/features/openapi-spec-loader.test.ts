import { loadSpec, type OpenApiSpecCache } from '@/features/tools/sources/openapi-spec-loader';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';

const config = { id: 'qa-openapi-url', name: 'QA', enabled: true, sourceType: 'url', specUrl: 'http://127.0.0.1:43117/openapi.json' } as OpenApiToolConfig;

function memoryCache(initial: Record<string, string> = {}): OpenApiSpecCache & { stored: Record<string, string> } {
	const stored = { ...initial };
	return {
		stored,
		read: async (id) => stored[id] ?? null,
		write: async (id, spec) => { stored[id] = spec; },
	};
}

function http(text: string) {
	return { request: jest.fn(async () => ({ ok: true, status: 200, text, json: JSON.parse(text) as unknown, headers: {} })) };
}

describe('loadSpec for a URL source', () => {
	it('serves the cached spec without a request', async () => {
		const client = http('{"fresh":true}');

		const spec = await loadSpec(config, { fileSystem: {} as never, specCache: memoryCache({ 'qa-openapi-url': '{"cached":true}' }), http: client as never });

		expect(spec).toBe('{"cached":true}');
		expect(client.request).not.toHaveBeenCalled();
	});

	it('fetches and caches the spec when nothing is cached', async () => {
		const cache = memoryCache();

		const spec = await loadSpec(config, { fileSystem: {} as never, specCache: cache, http: http('{"fresh":true}') as never });

		expect(spec).toBe('{"fresh":true}');
		expect(cache.stored['qa-openapi-url']).toBe('{"fresh":true}');
	});

	it('refetches over an existing cached spec', async () => {
		const cache = memoryCache({ 'qa-openapi-url': '{"cached":true}' });
		const refetched = { ...config };

		const spec = await loadSpec(refetched, { fileSystem: {} as never, specCache: cache, http: http('{"fresh":true}') as never, refetch: true });

		expect(spec).toBe('{"fresh":true}');
		expect(cache.stored['qa-openapi-url']).toBe('{"fresh":true}');
		expect(refetched.lastFetchedAt).toEqual(expect.any(Number));
	});
});
