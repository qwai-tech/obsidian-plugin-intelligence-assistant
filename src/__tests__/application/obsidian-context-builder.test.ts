import { TFile, TFolder } from 'obsidian';
import {
	appendObsidianContextSnapshot,
	buildObsidianContextSnapshot,
} from '../../application/services/obsidian-context-builder';

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').pop() ?? path;
	file.basename = file.name.replace(/\.md$/, '');
	file.extension = 'md';
	return file;
}

function makeFolder(path: string): TFolder {
	const folder = new TFolder();
	folder.path = path;
	folder.name = path.split('/').pop() ?? path;
	return folder;
}

describe('obsidian context builder', () => {
	it('builds a file snapshot with content, properties, tags, links, and backlinks', async () => {
		const file = makeFile('Projects/AI.md');
		const app = {
			vault: {
				cachedRead: jest.fn(async () => '# AI Plan\n\nBuild an Obsidian-native agent.'),
				getMarkdownFiles: jest.fn(() => []),
			},
			metadataCache: {
				getFileCache: jest.fn(() => ({
					frontmatter: { status: 'draft', owner: 'chengqing' },
					tags: [{ tag: '#agent' }, { tag: '#obsidian' }],
					links: [{ link: 'Research/RAG' }, { link: 'People/Ada' }],
				})),
				resolvedLinks: {
					'Research/RAG.md': { 'Projects/AI.md': 1 },
					'Inbox/Idea.md': { 'Projects/AI.md': 2 },
				},
			},
		} as any;

		const snapshot = await buildObsidianContextSnapshot(app, [file]);

		expect(snapshot).toContain('Obsidian context snapshot');
		expect(snapshot).toContain('File: [[Projects/AI.md]]');
		expect(snapshot).toContain('status: draft');
		expect(snapshot).toContain('#agent');
		expect(snapshot).toContain('Outgoing links: [[Research/RAG]], [[People/Ada]]');
		expect(snapshot).toContain('Backlinks: [[Research/RAG.md]], [[Inbox/Idea.md]]');
		expect(snapshot).toContain('Build an Obsidian-native agent.');
	});

	it('builds a folder snapshot with a bounded markdown file list', async () => {
		const folder = makeFolder('Projects');
		const app = {
			vault: {
				getMarkdownFiles: jest.fn(() => [
					makeFile('Projects/A.md'),
					makeFile('Projects/Nested/B.md'),
					makeFile('Projects/C.md'),
					makeFile('Archive/Old.md'),
				]),
			},
			metadataCache: {
				getFileCache: jest.fn(),
				resolvedLinks: {},
			},
		} as any;

		const snapshot = await buildObsidianContextSnapshot(app, [folder], { maxFolderFiles: 2 });

		expect(snapshot).toContain('Folder: Projects');
		expect(snapshot).toContain('[[Projects/A.md]]');
		expect(snapshot).toContain('[[Projects/C.md]]');
		expect(snapshot).not.toContain('[[Projects/Nested/B.md]]');
		expect(snapshot).not.toContain('Archive/Old.md');
		expect(snapshot).toContain('...and 1 more note(s).');
	});

	it('appends a snapshot after the user-visible task prompt', () => {
		const combined = appendObsidianContextSnapshot('Summarize this note.', 'Obsidian context snapshot\nFile: [[A.md]]');

		expect(combined).toContain('Summarize this note.');
		expect(combined).toContain('---');
		expect(combined).toContain('File: [[A.md]]');
	});
});
