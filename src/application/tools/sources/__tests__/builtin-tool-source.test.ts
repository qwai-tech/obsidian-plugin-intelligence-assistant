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

	it('loads exactly the six builtin tools', async () => {
		const tools = await makeSource().load();
		const names = tools.map((t) => t.definition.name).sort();
		expect(names).toEqual(
			[
				'append_to_note',
				'create_note',
				'list_files',
				'read_file',
				'search_files',
				'write_file',
			].sort(),
		);
	});

	it('returns tools that each have a definition and an execute function', async () => {
		const tools = await makeSource().load();
		expect(tools).toHaveLength(6);
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
});
