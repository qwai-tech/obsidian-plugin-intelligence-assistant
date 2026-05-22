import { OpenApiToolSource } from '../openapi-tool-source';
import type { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';

/** Minimal in-memory IFileSystem. */
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

const SPEC = JSON.stringify({
	info: { title: 'Demo API' },
	servers: [{ url: 'https://api.example.com' }],
	paths: {
		'/items': { get: { operationId: 'listItems', summary: 'List items' } },
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

describe('OpenApiToolSource', () => {
	it('exposes openapi kind with id and label from the config', () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		expect(source.kind).toBe('openapi');
		expect(source.id).toBe('demo');
		expect(source.label).toBe('Demo API');
	});

	it('loads tools generated from the spec', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		const tools = await source.load();
		expect(tools).toHaveLength(1);
		expect(typeof tools[0].execute).toBe('function');
	});

	it('returns an empty list for a disabled config', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig({ enabled: false }), fs, '/plugin/data');
		expect(await source.load()).toEqual([]);
	});

	it('propagates a spec parse failure so the registry can isolate it', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': 'not-json' });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		await expect(source.load()).rejects.toThrow('Failed to parse OpenAPI JSON specification');
	});

	it('dispose is a no-op that resolves', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		await expect(source.dispose()).resolves.toBeUndefined();
	});
});
