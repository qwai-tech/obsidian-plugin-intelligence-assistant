import { isIndexable, type IndexFilters } from '@/core/rag-index-filter';

const filters = (overrides: Partial<IndexFilters> = {}): IndexFilters => ({
	excludeFolders: [],
	includeFileTypes: [],
	excludeFileTypes: [],
	filterByTag: [],
	excludeByTag: [],
	...overrides,
});

const note = (path: string, tags: string[] = []) => ({ path, extension: path.split('.').pop() ?? '', tags });

describe('isIndexable', () => {
	it('indexes every note when no filter is set', () => {
		expect(isIndexable(note('a/b.md'), filters())).toBe(true);
	});

	it('skips notes inside an excluded folder and its subfolders, but not folders that only share a prefix', () => {
		const config = filters({ excludeFolders: ['Private/', 'Archive'] });

		expect(isIndexable(note('Private/diary.md'), config)).toBe(false);
		expect(isIndexable(note('Archive/2024/old.md'), config)).toBe(false);
		expect(isIndexable(note('PrivateNotes/open.md'), config)).toBe(true);
	});

	it('keeps only the included file types, written with or without a dot', () => {
		const config = filters({ includeFileTypes: ['.md', 'TXT'] });

		expect(isIndexable(note('a.md'), config)).toBe(true);
		expect(isIndexable(note('a.txt'), config)).toBe(true);
		expect(isIndexable(note('a.canvas'), config)).toBe(false);
	});

	it('skips excluded file types and folder entries in the excluded types list', () => {
		const config = filters({ excludeFileTypes: ['canvas', 'node_modules/'] });

		expect(isIndexable(note('a.canvas'), config)).toBe(false);
		expect(isIndexable(note('node_modules/readme.md'), config)).toBe(false);
		expect(isIndexable(note('a.md'), config)).toBe(true);
	});

	it('skips notes carrying an excluded tag, including its nested tags, whatever the case or hash', () => {
		const config = filters({ excludeByTag: ['#Private'] });

		expect(isIndexable(note('a.md', ['#private']), config)).toBe(false);
		expect(isIndexable(note('b.md', ['#private/health']), config)).toBe(false);
		expect(isIndexable(note('c.md', ['#privateish']), config)).toBe(true);
	});

	it('keeps only notes with one of the required tags when a tag filter is set', () => {
		const config = filters({ filterByTag: ['reference'] });

		expect(isIndexable(note('a.md', ['#reference']), config)).toBe(true);
		expect(isIndexable(note('b.md', ['#idea']), config)).toBe(false);
	});

	it('lets an excluded tag win over a required one', () => {
		const config = filters({ filterByTag: ['reference'], excludeByTag: ['draft'] });

		expect(isIndexable(note('a.md', ['#reference', '#draft']), config)).toBe(false);
	});
});
