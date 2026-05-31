import { BuiltinToolSource } from '../builtin-tool-source';
import { App } from 'obsidian';

describe('BuiltinToolSource', () => {
	function makeSource(): BuiltinToolSource {
		return new BuiltinToolSource(new App());
	}

	it('exposes builtin kind and id', () => {
		const source = makeSource();
		expect(source.kind).toBe('builtin');
		expect(source.id).toBe('builtin');
		expect(source.label).toBe('Built-in Tools');
	});

	it('loads exactly the builtin tools', async () => {
		const tools = await makeSource().load();
		const names = tools.map((t) => t.definition.name).sort();
		expect(names).toEqual(
			[
				'append_to_note',
				'create_note',
				'list_files',
				'read_canvas',
				'read_file',
				'search_files',
				'update_canvas',
				'update_properties',
				'write_file',
			].sort(),
		);
	});

	it('returns tools that each have a definition and an execute function', async () => {
		const tools = await makeSource().load();
		expect(tools).toHaveLength(9);
		for (const tool of tools) {
			expect(typeof tool.definition.name).toBe('string');
			expect(typeof tool.execute).toBe('function');
		}
	});

	it('returns fresh instances on each load call', async () => {
		const source = makeSource();
		const first = await source.load();
		const second = await source.load();
		expect(first[0]).not.toBe(second[0]);
	});

	it('dispose is a no-op that resolves', async () => {
		await expect(makeSource().dispose()).resolves.toBeUndefined();
	});

	it('filters by getEnabledTypes when provided', async () => {
		const enabled = new Set(['read_file', 'list_files']);
		const source = new BuiltinToolSource(new App(), () => enabled);
		const tools = await source.load();
		const names = tools.map((t) => t.definition.name).sort();
		expect(names).toEqual(['list_files', 'read_file']);
	});

	it('re-reads the enabled set on each load (toggle takes effect on reload)', async () => {
		const enabledSet = new Set<string>(['read_file']);
		const source = new BuiltinToolSource(new App(), () => enabledSet);

		const first = await source.load();
		expect(first.map((t) => t.definition.name)).toEqual(['read_file']);

		enabledSet.add('write_file');
		const second = await source.load();
		expect(second.map((t) => t.definition.name).sort()).toEqual(['read_file', 'write_file']);
	});

	it('treats a null return from getEnabledTypes as "load all"', async () => {
		const source = new BuiltinToolSource(new App(), () => null);
		const tools = await source.load();
		expect(tools).toHaveLength(9);
	});

	it('returns no tools when getEnabledTypes returns an empty iterable', async () => {
		const source = new BuiltinToolSource(new App(), () => []);
		const tools = await source.load();
		expect(tools).toHaveLength(0);
	});
});
