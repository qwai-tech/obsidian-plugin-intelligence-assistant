import { createIncrementalIndexHandlers, type IncrementalIndexTarget } from '@/infrastructure/rag/incremental-indexer';

/** A fake RAG index target that records which incremental op was called. */
function makeTarget() {
	const calls = {
		indexFile: [] as string[],
		removeFile: [] as string[],
		renameFile: [] as Array<[string, string]>,
	};
	const target: IncrementalIndexTarget = {
		indexFile: jest.fn(async (file) => { calls.indexFile.push(file.path); }),
		removeFile: jest.fn(async (path) => { calls.removeFile.push(path); return 1; }),
		renameFile: jest.fn(async (oldPath, newPath) => { calls.renameFile.push([oldPath, newPath]); return 1; }),
	};
	return { target, calls };
}

/** Synchronous fake timer so debounced work runs deterministically. */
function makeFakeTimer() {
	let pending: Array<{ id: number; fn: () => void }> = [];
	let nextId = 1;
	return {
		setTimeoutFn: (fn: () => void) => {
			const id = nextId++;
			pending.push({ id, fn });
			return id as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => {
			pending = pending.filter((p) => p.id !== (handle as unknown as number));
		},
		flushAll: () => {
			const due = pending;
			pending = [];
			for (const p of due) p.fn();
		},
		pendingCount: () => pending.length,
	};
}

const ENABLED = { enabled: true, embedChangedFiles: true };

const tfile = (path: string) => ({ path, extension: path.split('.').pop() ?? '', basename: path.split('/').pop()?.replace(/\.\w+$/, '') ?? '' });

describe('incremental RAG indexing handlers', () => {
	it('modify indexes only the changed file (no full reindex) after debounce', () => {
		const { target, calls } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onModify(tfile('notes/a.md'));
		// Debounced — nothing fired yet.
		expect(target.indexFile).not.toHaveBeenCalled();

		timer.flushAll();
		expect(calls.indexFile).toEqual(['notes/a.md']);
		expect(target.removeFile).not.toHaveBeenCalled();
		expect(target.renameFile).not.toHaveBeenCalled();
	});

	it('coalesces rapid modifies of the same file into one indexFile call', () => {
		const { target, calls } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onModify(tfile('notes/a.md'));
		handlers.onModify(tfile('notes/a.md'));
		handlers.onModify(tfile('notes/a.md'));
		expect(timer.pendingCount()).toBe(1);

		timer.flushAll();
		expect(calls.indexFile).toEqual(['notes/a.md']);
		expect(target.indexFile).toHaveBeenCalledTimes(1);
	});

	it('create indexes immediately (no debounce)', () => {
		const { target, calls } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onCreate(tfile('notes/new.md'));
		expect(calls.indexFile).toEqual(['notes/new.md']);
	});

	it('delete removes only that file and cancels a pending modify', () => {
		const { target, calls } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onModify(tfile('notes/a.md'));
		handlers.onDelete(tfile('notes/a.md'));
		timer.flushAll();

		expect(calls.removeFile).toEqual(['notes/a.md']);
		// The pending modify was cancelled by the delete.
		expect(target.indexFile).not.toHaveBeenCalled();
	});

	it('rename re-keys chunks from old path to new path', () => {
		const { target, calls } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onRename(tfile('notes/new-name.md'), 'notes/old-name.md');
		expect(calls.renameFile).toEqual([['notes/old-name.md', 'notes/new-name.md']]);
		expect(target.indexFile).not.toHaveBeenCalled();
		expect(target.removeFile).not.toHaveBeenCalled();
	});

	it('ignores non-markdown files on modify', () => {
		const { target } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onModify(tfile('assets/pic.png'));
		timer.flushAll();
		expect(target.indexFile).not.toHaveBeenCalled();
	});

	it('does nothing when RAG is disabled', () => {
		const { target } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(
			target,
			() => ({ enabled: false, embedChangedFiles: true }),
			timer,
		);

		handlers.onCreate(tfile('notes/a.md'));
		handlers.onModify(tfile('notes/a.md'));
		handlers.onDelete(tfile('notes/a.md'));
		timer.flushAll();
		expect(target.indexFile).not.toHaveBeenCalled();
		expect(target.removeFile).not.toHaveBeenCalled();
	});

	it('metadataCache changed schedules an incremental index of just that file', () => {
		const { target, calls } = makeTarget();
		const timer = makeFakeTimer();
		const handlers = createIncrementalIndexHandlers(target, () => ENABLED, timer);

		handlers.onMetadataChanged(tfile('notes/meta.md'));
		timer.flushAll();
		expect(calls.indexFile).toEqual(['notes/meta.md']);
	});
});
