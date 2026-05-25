import { loadOpenApiTools } from '../openapi-loader-core';
import type { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';

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
		const tools = await loadOpenApiTools(makeConfig(), fs, '/plugin/data');
		expect(tools).toHaveLength(2);
	});

	it('returns an empty list when the config is disabled', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig({ enabled: false }), fs, '/plugin/data');
		expect(tools).toEqual([]);
	});

	it('tags each generated tool with the openapi provider id', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), fs, '/plugin/data');
		for (const tool of tools) {
			expect(tool.provider).toBe('openapi:demo');
		}
	});

	it('throws when the spec JSON is invalid', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': 'not-json' });
		await expect(loadOpenApiTools(makeConfig(), fs, '/plugin/data')).rejects.toThrow(
			'Failed to parse OpenAPI JSON specification',
		);
	});

	it('produces tools whose definitions carry the operation parameters', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), fs, '/plugin/data');
		const getItem = tools.find((t) => t.definition.parameters.some((p) => p.name === 'id'));
		expect(getItem).toBeDefined();
	});
});
