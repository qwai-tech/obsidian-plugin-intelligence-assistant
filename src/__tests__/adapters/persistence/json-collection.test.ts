import { JsonCollection } from '@/adapters/persistence/json-collection';

interface Note {
	id: string;
	name: string;
}

const makeAdapter = () => {
	const files = new Map<string, string>();
	return {
		files,
		exists: jest.fn(async (path: string) => files.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`))),
		read: jest.fn(async (path: string) => {
			const body = files.get(path);
			if (body === undefined) throw new Error(`missing ${path}`);
			return body;
		}),
		write: jest.fn(async (path: string, body: string) => {
			files.set(path, body);
		}),
		remove: jest.fn(async (path: string) => {
			files.delete(path);
		}),
		rename: jest.fn(async (from: string, to: string) => {
			files.set(to, files.get(from) ?? '');
			files.delete(from);
		}),
		mkdir: jest.fn(async () => undefined),
		list: jest.fn(async (folder: string) => ({
			files: [...files.keys()].filter((f) => f.startsWith(`${folder}/`) && !f.slice(folder.length + 1).includes('/')),
			folders: [],
		})),
	};
};

const collection = (adapter: ReturnType<typeof makeAdapter>) => new JsonCollection<Note, { id: string; name: string; file: string }>(
	adapter as never,
	'data/notes',
	{ entriesKey: 'notes', filePrefix: 'note', toEntry: (note, file) => ({ id: note.id, name: note.name, file }) },
);

describe('JsonCollection', () => {
	it('round-trips items and the active id', async () => {
		const adapter = makeAdapter();

		await collection(adapter).save([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'b');
		const loaded = await collection(adapter).load();

		expect(loaded.items).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
		expect(loaded.activeId).toBe('b');
		expect(loaded.indexExists).toBe(true);
	});

	it('keeps the index layout under the configured key', async () => {
		const adapter = makeAdapter();

		await collection(adapter).save([{ id: 'a', name: 'A' }], null);

		const index = JSON.parse(adapter.files.get('data/notes/index.json') ?? '{}') as { notes: Array<{ file: string }> };
		expect(index.notes[0].file).toMatch(/^data\/notes\/.+\.json$/);
	});

	it('removes files of items that were dropped', async () => {
		const adapter = makeAdapter();
		const notes = collection(adapter);
		await notes.save([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], null);

		await notes.save([{ id: 'a', name: 'A' }], null);

		expect([...adapter.files.keys()].filter((f) => f !== 'data/notes/index.json')).toHaveLength(1);
	});

	it('reports a missing index and finds items by scanning the folder', async () => {
		const adapter = makeAdapter();
		adapter.files.set('data/notes/loose.json', JSON.stringify({ id: 'loose', name: 'Loose' }));
		const notes = collection(adapter);

		expect((await notes.load()).indexExists).toBe(false);
		expect(await notes.scan()).toEqual([{ id: 'loose', name: 'Loose' }]);
	});
});
