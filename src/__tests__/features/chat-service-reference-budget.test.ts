import {
	ChatService,
	MAX_REFERENCE_CHARS_PER_FILE,
	MAX_REFERENCE_TOTAL_CHARS,
} from '@/features/chat/chat.service';
import type { FileReference } from '@/features/chat/types/attachments';

/**
 * Referenced notes are inlined into the prompt and re-sent every agent turn, so
 * their size must be bounded. These tests pin the per-file + total caps and the
 * read_file fallback hint so the (c)-type token cost can't silently balloon.
 */
function serviceWithFiles(files: Record<string, string>): ChatService {
	const fileSystem = {
		read: async (path: string) => files[path] ?? '',
		listRecursive: async (folder: string) => Object.keys(files).filter(path => path.startsWith(`${folder}/`)),
	} as any;
	return new ChatService({ fileSystem, knowledge: {} as any, webSearchService: {} as any, settings: () => ({ llmConfigs: [], defaultModel: 'gpt-4o' }) });
}

const fileRef = (path: string): FileReference => ({ type: 'file', path, name: path });

describe('ChatService.buildReferenceContext — token budget', () => {
	it('embeds a small note in full', async () => {
		const svc = serviceWithFiles({ 'A.md': 'short body' });
		const { llmContent } = await svc.buildReferenceContext('q', [fileRef('A.md')]);
		expect(llmContent).toContain('short body');
		expect(llmContent).not.toContain('truncated');
	});

	it('truncates a note larger than the per-file cap and points to read_file', async () => {
		const big = 'x'.repeat(MAX_REFERENCE_CHARS_PER_FILE + 5000);
		const svc = serviceWithFiles({ 'Big.md': big });
		const { llmContent } = await svc.buildReferenceContext('q', [fileRef('Big.md')]);
		// The inlined body must be bounded near the per-file cap, not the full file.
		expect(llmContent.length).toBeLessThan(big.length);
		expect(llmContent).toContain('truncated');
		expect(llmContent).toContain('read_file("Big.md")');
	});

	it('omits later references once the total budget is exhausted', async () => {
		const big = 'y'.repeat(MAX_REFERENCE_CHARS_PER_FILE);
		// 4 files * 8000 = 32000 > 24000 total budget, so the last one is omitted.
		const files = { 'A.md': big, 'B.md': big, 'C.md': big, 'D.md': big };
		const svc = serviceWithFiles(files);
		const refs = [fileRef('A.md'), fileRef('B.md'), fileRef('C.md'), fileRef('D.md')];
		const { llmContent } = await svc.buildReferenceContext('q', refs);
		expect(llmContent.length).toBeLessThan(MAX_REFERENCE_TOTAL_CHARS + 2000);
		expect(llmContent).toContain('omitted to stay within the reference budget');
		expect(llmContent).toContain('read_file("D.md")');
	});

	it('still returns the references array unchanged (sense path unaffected)', async () => {
		const svc = serviceWithFiles({ 'A.md': 'body' });
		const refs = [fileRef('A.md')];
		const { references } = await svc.buildReferenceContext('q', refs);
		expect(references).toEqual(refs);
	});

	it('inlines the notes inside a referenced folder', async () => {
		const svc = serviceWithFiles({ 'Projects/aurora.md': 'AURORA_7391', 'Projects/deep/plan.md': 'PLAN_42', 'Projects/diagram.png': 'binary', 'Other.md': 'nope' });

		const { llmContent } = await svc.buildReferenceContext('q', [{ type: 'folder', path: 'Projects', name: 'Projects' }]);

		expect(llmContent).toContain('AURORA_7391');
		expect(llmContent).toContain('PLAN_42');
		expect(llmContent).not.toContain('binary');
		expect(llmContent).not.toContain('nope');
	});
});
