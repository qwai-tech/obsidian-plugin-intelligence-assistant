import { loadOpenApiTools } from '../openapi-loader-core';
import type { OpenApiLoadContext } from '../openapi-spec-loader';
import type { HttpPort, HttpRequest } from '@qwai/obsidian-llm';
import type { IFileSystem } from '@/core/interfaces/file-system.interface';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';

/** Minimal in-memory IFileSystem for spec loading tests. */
function makeFileSystem(files: Record<string, string>): IFileSystem {
	return {
		exists: async (p: string) => p in files,
		read: async (p: string) => {
			if (!(p in files)) {
				throw new Error(`not found: ${p}`);
			}
			return files[p];
		},
		write: async () => undefined,
		mkdir: async () => undefined,
		listRecursive: async () => Object.keys(files),
		getDisplayName: (p: string) => p,
		isDirectory: async () => false,
	};
}

function makeHttp(text: string, json: unknown = undefined) {
	const requests: HttpRequest[] = [];
	const http = {
		request: jest.fn(async (req: HttpRequest) => {
			requests.push(req);
			return { status: 200, ok: true, text, json, headers: { 'content-type': 'application/json' } };
		}),
		stream: jest.fn(),
	} as unknown as HttpPort;
	return { http, requests };
}

const noCache = { read: async () => null, write: async () => undefined };

const context = (fileSystem: IFileSystem, http: HttpPort = makeHttp('').http, specCache: OpenApiLoadContext['specCache'] = noCache): OpenApiLoadContext => ({
	fileSystem,
	specCache,
	http,
});

/** A tiny but valid OpenAPI document with two operations. */
const SPEC = JSON.stringify({
	info: { title: 'Demo API' },
	servers: [{ url: 'https://api.example.com' }],
	paths: {
		'/items': {
			get: {
				operationId: 'listItems',
				summary: 'List items',
				parameters: [
					{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
				],
			},
		},
		'/items/{id}': {
			get: {
				operationId: 'getItem',
				summary: 'Get one item',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
				],
			},
		},
	},
});

function makeConfig(overrides: Partial<OpenApiToolConfig> = {}): OpenApiToolConfig {
	return {
		id: 'demo',
		name: 'Demo API',
		enabled: true,
		sourceType: 'file',
		specPath: 'specs/demo.json',
		...overrides,
	};
}

describe('loadOpenApiTools', () => {
	it('generates one tool per operation from a local spec', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), context(fs));
		expect(tools).toHaveLength(2);
	});

	it('returns an empty list when the config is disabled', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig({ enabled: false }), context(fs));
		expect(tools).toEqual([]);
	});

	it('tags each generated tool with the openapi provider id', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), context(fs));
		for (const tool of tools) {
			expect(tool.provider).toBe('openapi:demo');
		}
	});

	it('throws when the spec JSON is invalid', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': 'not-json' });
		await expect(loadOpenApiTools(makeConfig(), context(fs))).rejects.toThrow(
			'Failed to parse OpenAPI JSON specification',
		);
	});

	it('produces tools whose definitions carry the operation parameters', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), context(fs));
		const getItem = tools.find((t) => t.definition.parameters.some((p) => p.name === 'id'));
		expect(getItem).toBeDefined();
	});

	it('fetches a URL spec through the HTTP port and caches it', async () => {
		const written: Record<string, string> = {};
		const specCache = { read: async () => null, write: async (id: string, body: string) => { written[id] = body; } };
		const { http, requests } = makeHttp(SPEC);

		const tools = await loadOpenApiTools(
			makeConfig({ sourceType: 'url', specUrl: 'https://api.example.com/openapi.json' }),
			context(makeFileSystem({}), http, specCache),
		);

		expect(tools).toHaveLength(2);
		expect(requests[0]).toMatchObject({ url: 'https://api.example.com/openapi.json', method: 'GET' });
		expect(Object.values(written)).toContain(SPEC);
	});

	it('runs generated tools through the HTTP port', async () => {
		const { http, requests } = makeHttp('{"id":"42"}', { id: '42' });
		const [, getItem] = await loadOpenApiTools(makeConfig(), context(makeFileSystem({ 'specs/demo.json': SPEC }), http));

		const result = await getItem.execute({ id: '42' });

		expect(result).toMatchObject({ success: true });
		expect(requests[0]).toMatchObject({ url: 'https://api.example.com/items/42', method: 'GET' });
	});
});
