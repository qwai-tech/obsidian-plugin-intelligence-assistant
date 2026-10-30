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

const collection = (adapter: ReturnType<typeof makeAdapter>) => new JsonCollection<Note>(adapter as never, 'data/notes', 'notes');

describe('JsonCollection', () => {
	it('reads the items listed in the index, with the active id', async () => {
		const adapter = makeAdapter();
		adapter.files.set('data/notes/index.json', JSON.stringify({ activeId: 'b', notes: [{ file: 'data/notes/note-a.json' }, { file: 'data/notes/note-b.json' }] }));
		adapter.files.set('data/notes/note-a.json', JSON.stringify({ id: 'a', name: 'A' }));
		adapter.files.set('data/notes/note-b.json', JSON.stringify({ id: 'b', name: 'B' }));

		expect(await collection(adapter).load()).toEqual({ items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], activeId: 'b', indexExists: true });
	});

	it('skips index entries whose file is missing', async () => {
		const adapter = makeAdapter();
		adapter.files.set('data/notes/index.json', JSON.stringify({ notes: [{ file: 'data/notes/gone.json' }, { file: 'data/notes/note-a.json' }] }));
		adapter.files.set('data/notes/note-a.json', JSON.stringify({ id: 'a', name: 'A' }));

		expect((await collection(adapter).load()).items).toEqual([{ id: 'a', name: 'A' }]);
	});

	it('reports a missing index', async () => {
		expect(await collection(makeAdapter()).load()).toEqual({ items: [], activeId: null, indexExists: false });
	});
});
