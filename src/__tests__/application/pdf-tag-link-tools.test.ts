import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { ReadPdfTool } from '@/application/services/pdf-tools';
import { FindNotesByTagTool, ResolveLinkTool } from '@/application/services/tag-tools';
import { MakeLinkTool } from '@/application/services/link-tools';

function makeTFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').pop() ?? path;
	const dot = file.name.lastIndexOf('.');
	file.extension = dot >= 0 ? file.name.slice(dot + 1) : '';
	file.basename = dot >= 0 ? file.name.slice(0, dot) : file.name;
	return file;
}

/** Encode page texts the way the loadPdfJs mock expects (form-feed separator). */
function encodePdf(pages: string[]): ArrayBuffer {
	const bytes = new TextEncoder().encode(pages.join('\f'));
	// Return a standalone ArrayBuffer copy.
	return bytes.slice().buffer;
}

describe('ReadPdfTool (loadPdfJs)', () => {
	it('extracts text from a PDF via loadPdfJs', async () => {
		const file = makeTFile('docs/report.pdf');
		const data = encodePdf(['Hello world', 'Second page here']);
		const app = {
			vault: {
				getAbstractFileByPath: () => file,
				readBinary: async () => data,
			},
		} as unknown as App;

		const tool = new ReadPdfTool(app);
		const res = await tool.execute({ path: 'docs/report.pdf' });

		expect(res.success).toBe(true);
		expect(res.result).toContain('Hello world');
		expect(res.result).toContain('Second page here');
	});

	it('honours maxPages and reports truncation', async () => {
		const file = makeTFile('docs/report.pdf');
		const data = encodePdf(['Page one', 'Page two', 'Page three']);
		const app = {
			vault: {
				getAbstractFileByPath: () => file,
				readBinary: async () => data,
			},
		} as unknown as App;

		const tool = new ReadPdfTool(app);
		const res = await tool.execute({ path: 'docs/report.pdf', maxPages: 1 });

		expect(res.success).toBe(true);
		expect(res.result).toContain('Page one');
		expect(res.result).not.toContain('Page two');
		expect(res.result).toContain('read 1 of 3');
	});

	it('rejects non-PDF files', async () => {
		const app = {
			vault: { getAbstractFileByPath: () => makeTFile('note.md') },
		} as unknown as App;
		const res = await new ReadPdfTool(app).execute({ path: 'note.md' });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/Not a PDF/);
	});

	it('errors when the file is missing', async () => {
		const app = { vault: { getAbstractFileByPath: () => null } } as unknown as App;
		const res = await new ReadPdfTool(app).execute({ path: 'missing.pdf' });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/File not found/);
	});
});

describe('FindNotesByTagTool (getAllTags)', () => {
	function appWithTags(): App {
		const a = makeTFile('a.md');
		const b = makeTFile('b.md');
		const c = makeTFile('c.md');
		const caches: Record<string, unknown> = {
			'a.md': { frontmatter: { tags: ['project', 'urgent'] } },
			'b.md': { tags: [{ tag: '#project' }] }, // inline tag
			'c.md': { frontmatter: { tags: ['idea'] } },
		};
		return {
			vault: { getMarkdownFiles: () => [a, b, c] },
			metadataCache: { getFileCache: (f: TFile) => caches[f.path] ?? null },
		} as unknown as App;
	}

	it('finds notes by frontmatter and inline tags (with or without #)', async () => {
		const tool = new FindNotesByTagTool(appWithTags());
		const res = await tool.execute({ tag: 'project' });
		expect(res.success).toBe(true);
		const paths = (res.result as Array<{ path: string }>).map((m) => m.path).sort();
		expect(paths).toEqual(['a.md', 'b.md']);
	});

	it('accepts a leading # in the query', async () => {
		const res = await new FindNotesByTagTool(appWithTags()).execute({ tag: '#idea' });
		const paths = (res.result as Array<{ path: string }>).map((m) => m.path);
		expect(paths).toEqual(['c.md']);
	});
});

describe('ResolveLinkTool (parseLinktext / resolveSubpath)', () => {
	it('resolves a wikilink with a heading subpath to a path + offsets', async () => {
		const target = makeTFile('notes/Target.md');
		const cache = {
			headings: [
				{ heading: 'Intro', position: { start: { offset: 0 } } },
				{ heading: 'Details', position: { start: { offset: 100 } } },
			],
		};
		const app = {
			metadataCache: {
				getFirstLinkpathDest: () => target,
				getFileCache: () => cache,
			},
		} as unknown as App;

		const res = await new ResolveLinkTool(app).execute({ linktext: 'Target#Intro' });
		expect(res.success).toBe(true);
		const r = res.result as { path: string; subpath: string; resolvedSubpath: { start: number; end: number | null } };
		expect(r.path).toBe('notes/Target.md');
		expect(r.subpath).toBe('#Intro');
		expect(r.resolvedSubpath).toEqual({ start: 0, end: 100 });
	});

	it('errors when the link target is missing', async () => {
		const app = {
			metadataCache: { getFirstLinkpathDest: () => null },
		} as unknown as App;
		const res = await new ResolveLinkTool(app).execute({ linktext: 'Nope' });
		expect(res.success).toBe(false);
	});
});

describe('MakeLinkTool (fileManager.generateMarkdownLink)', () => {
	it('produces a vault-correct link honouring fileManager.generateMarkdownLink', async () => {
		const file = makeTFile('Folder/My Note.md');
		const generateMarkdownLink = jest.fn(
			(f: TFile, _src: string, _sub?: string, alias?: string) =>
				alias ? `[[${f.basename}|${alias}]]` : `[[${f.basename}]]`,
		);
		const app = {
			vault: { getAbstractFileByPath: () => file },
			fileManager: { generateMarkdownLink },
		} as unknown as App;

		const res = await new MakeLinkTool(app).execute({
			path: 'Folder/My Note.md',
			sourcePath: 'Index.md',
			alias: 'see note',
		});

		expect(res.success).toBe(true);
		expect(generateMarkdownLink).toHaveBeenCalledWith(file, 'Index.md', undefined, 'see note');
		expect(res.result).toBe('[[My Note|see note]]');
	});

	it('errors when the target note is missing', async () => {
		const app = {
			vault: { getAbstractFileByPath: () => null },
			fileManager: { generateMarkdownLink: jest.fn() },
		} as unknown as App;
		const res = await new MakeLinkTool(app).execute({ path: 'missing.md' });
		expect(res.success).toBe(false);
	});
});
