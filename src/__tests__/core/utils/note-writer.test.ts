import { MarkdownView, TFile } from 'obsidian';
import { changedRange, rewriteNote } from '@/core/utils/note-writer';

const makeFile = (path: string): TFile => Object.assign(new TFile(), { path });

const textEditor = (initial: string) => {
	let text = initial;
	const offset = (pos: { line: number; ch: number }) => text.split('\n').slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch;
	return {
		get text() { return text; },
		getValue: () => text,
		offsetToPos: (at: number) => {
			const before = text.slice(0, at).split('\n');
			return { line: before.length - 1, ch: before[before.length - 1].length };
		},
		replaceRange: jest.fn((replacement: string, from: { line: number; ch: number }, to: { line: number; ch: number }) => {
			text = text.slice(0, offset(from)) + replacement + text.slice(offset(to));
		}),
	};
};

const appWith = (views: unknown[], stored = 'on disk') => {
	let disk = stored;
	return {
		get disk() { return disk; },
		workspace: { getLeavesOfType: jest.fn(() => views.map(view => ({ view }))) },
		vault: {
			process: jest.fn(async (_file: TFile, fn: (data: string) => string) => {
				disk = fn(disk);
				return disk;
			}),
			modify: jest.fn(),
		},
	};
};

const openView = (file: TFile, editor: unknown) => Object.assign(new MarkdownView(), { file, editor });

describe('changedRange', () => {
	it('covers only the part between the common prefix and suffix', () => {
		expect(changedRange('alpha beta gamma', 'alpha BETA gamma')).toEqual({ start: 6, end: 10, text: 'BETA' });
	});

	it('handles pure insertions and deletions', () => {
		expect(changedRange('ac', 'abc')).toEqual({ start: 1, end: 1, text: 'b' });
		expect(changedRange('abc', 'ac')).toEqual({ start: 1, end: 2, text: '' });
	});

	it('does not let prefix and suffix overlap on repeated text', () => {
		expect(changedRange('aa', 'aaa')).toEqual({ start: 2, end: 2, text: 'a' });
	});

	it('returns null when nothing changed', () => {
		expect(changedRange('same', 'same')).toBeNull();
	});
});

describe('rewriteNote', () => {
	it('rewrites a note that is not open atomically through the vault', async () => {
		const app = appWith([]);

		await rewriteNote(app as never, makeFile('A.md'), current => `${current}!`);

		expect(app.disk).toBe('on disk!');
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it('edits an open note through its editor, replacing only the changed range', async () => {
		const file = makeFile('A.md');
		const editor = textEditor('line one\nline two\nline three');
		const app = appWith([openView(makeFile('B.md'), textEditor('other')), openView(file, editor)]);

		await rewriteNote(app as never, file, current => current.replace('two', '2'));

		expect(editor.text).toBe('line one\nline 2\nline three');
		expect(editor.replaceRange).toHaveBeenCalledWith('2', { line: 1, ch: 5 }, { line: 1, ch: 8 });
		expect(app.vault.process).not.toHaveBeenCalled();
	});

	it('leaves an open note untouched when the rewrite changes nothing', async () => {
		const file = makeFile('A.md');
		const editor = textEditor('same');
		const app = appWith([openView(file, editor)]);

		await rewriteNote(app as never, file, current => current);

		expect(editor.replaceRange).not.toHaveBeenCalled();
	});

	it('passes the editor text, including unsaved edits, to the rewrite', async () => {
		const file = makeFile('A.md');
		const app = appWith([openView(file, textEditor('unsaved edit'))], 'stale disk');
		const seen: string[] = [];

		await rewriteNote(app as never, file, current => { seen.push(current); return current; });

		expect(seen).toEqual(['unsaved edit']);
	});
});
