import type { DataAdapter } from 'obsidian';
import { AdapterOpenApiSpecCache } from '@/adapters/persistence/openapi-spec-cache';

function hiddenFolderAdapter(): DataAdapter {
	const files = new Map<string, string>();
	const folders = new Set<string>();
	return {
		exists: jest.fn(async (path: string) => files.has(path) || folders.has(path)),
		read: jest.fn(async (path: string) => {
			const content = files.get(path);
			if (content === undefined) throw new Error(`ENOENT ${path}`);
			return content;
		}),
		write: jest.fn(async (path: string, data: string) => { files.set(path, data); }),
		mkdir: jest.fn(async (path: string) => { folders.add(path); }),
	} as unknown as DataAdapter;
}

const FOLDER = '.obsidian/plugins/intelligence-assistant/data/openapi';

describe('AdapterOpenApiSpecCache', () => {
	it('reads a spec cached in the hidden plugin folder after a restart', async () => {
		const adapter = hiddenFolderAdapter();
		await new AdapterOpenApiSpecCache(adapter, FOLDER).write('qa-openapi-url', '{"openapi":"3.0.0"}');

		const restarted = new AdapterOpenApiSpecCache(adapter, FOLDER);

		expect(await restarted.read('qa-openapi-url')).toBe('{"openapi":"3.0.0"}');
		expect(adapter.write).toHaveBeenCalledWith(`${FOLDER}/qa-openapi-url.json`, '{"openapi":"3.0.0"}');
	});

	it('replaces an existing cached spec on refetch', async () => {
		const cache = new AdapterOpenApiSpecCache(hiddenFolderAdapter(), FOLDER);
		await cache.write('qa', 'old');

		await cache.write('qa', 'new');

		expect(await cache.read('qa')).toBe('new');
	});

	it('reports a spec that was never cached as missing', async () => {
		expect(await new AdapterOpenApiSpecCache(hiddenFolderAdapter(), FOLDER).read('never')).toBeNull();
	});
});
