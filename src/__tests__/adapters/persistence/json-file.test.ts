import { JsonFile } from '@/adapters/persistence/json-file';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeAdapter = (seed: Record<string, string> = {}) => {
	const files = new Map(Object.entries(seed));
	const adapter = {
		files,
		failWritesTo: null as string | null,
		exists: jest.fn(async (path: string) => files.has(path)),
		read: jest.fn(async (path: string) => {
			await tick();
			const body = files.get(path);
			if (body === undefined) throw new Error(`missing ${path}`);
			return body;
		}),
		write: jest.fn(async (path: string, body: string) => {
			await tick();
			if (adapter.failWritesTo === path) throw new Error('disk full');
			files.set(path, body);
		}),
		remove: jest.fn(async (path: string) => {
			files.delete(path);
		}),
		rename: jest.fn(async (from: string, to: string) => {
			const body = files.get(from);
			if (body === undefined) throw new Error(`missing ${from}`);
			if (files.has(to)) throw new Error(`exists ${to}`);
			files.delete(from);
			files.set(to, body);
		}),
		mkdir: jest.fn(async () => undefined),
	};
	return adapter;
};

describe('JsonFile', () => {
	it('returns the fallback when the file does not exist', async () => {
		const file = new JsonFile(makeAdapter() as never, 'data/a.json', () => ({ items: [] as string[] }));

		expect(await file.read()).toEqual({ items: [] });
	});

	it('reads back what it wrote', async () => {
		const file = new JsonFile(makeAdapter() as never, 'data/a.json', () => ({ n: 0 }));

		await file.write({ n: 5 });

		expect(await file.read()).toEqual({ n: 5 });
	});

	it('keeps the previous contents when a write fails midway', async () => {
		const adapter = makeAdapter({ 'data/a.json': '{"n":1}' });
		adapter.failWritesTo = 'data/a.json.tmp';
		const file = new JsonFile(adapter as never, 'data/a.json', () => ({ n: 0 }));

		await expect(file.write({ n: 2 })).rejects.toThrow('disk full');

		expect(adapter.files.get('data/a.json')).toBe('{"n":1}');
	});

	it('recovers the temp file when a replace was interrupted', async () => {
		const adapter = makeAdapter({ 'data/a.json.tmp': '{"n":3}' });
		const file = new JsonFile(adapter as never, 'data/a.json', () => ({ n: 0 }));

		expect(await file.read()).toEqual({ n: 3 });
	});

	it('rejects corrupt JSON and preserves it instead of silently returning an empty document', async () => {
		const adapter = makeAdapter({ 'data/a.json': '{not json' });
		const file = new JsonFile(adapter as never, 'data/a.json', () => ({ n: 0 }));

		await expect(file.read()).rejects.toThrow('existing file was preserved');
		expect(adapter.files.get('data/a.json')).toBe('{not json');
	});

	it('serializes concurrent updates so none are lost', async () => {
		const file = new JsonFile(makeAdapter() as never, 'data/a.json', () => ({ items: [] as string[] }));

		await Promise.all(['a', 'b', 'c'].map((item) => file.update((value) => {
			value.items.push(item);
		})));

		expect((await file.read()).items.sort()).toEqual(['a', 'b', 'c']);
	});
});
