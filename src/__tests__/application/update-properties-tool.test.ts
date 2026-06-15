import { TFile, parseYaml } from 'obsidian';
import type { App } from 'obsidian';
import { UpdatePropertiesTool } from '@/application/services/file-tools';
import type { WriteProposal } from '@/application/services/write-proposal-service';

function mockApp(content: string, frontmatter: Record<string, unknown>): App {
	const file = Object.assign(new TFile(), { path: 'note.md' });
	return {
		vault: {
			getAbstractFileByPath: () => file,
			read: async () => content,
		},
		metadataCache: { getFileCache: () => ({ frontmatter }) },
	} as unknown as App;
}

/** Parse the frontmatter out of a proposal's proposed content. */
function frontmatterOf(proposal: WriteProposal): Record<string, unknown> {
	const m = (proposal.proposedContent ?? '').match(/^---\n([\s\S]*?)\n---/);
	return m ? (parseYaml(m[1]) as Record<string, unknown>) : {};
}

describe('UpdatePropertiesTool — safe YAML serialization', () => {
	it('serializes values that need escaping (colon, array, nested object) without corruption', async () => {
		const tool = new UpdatePropertiesTool(mockApp('---\ntitle: Old\n---\nBody', { title: 'Old' }));

		const res = await tool.execute({
			path: 'note.md',
			updates: { summary: 'a: b: c', tags: ['x', 'y'], meta: { k: 1 } },
		});

		expect(res.success).toBe(true);
		const proposal = res.result as WriteProposal;
		// Proposal model preserved.
		expect(proposal.type).toBe('write_proposal');
		expect(proposal.operation).toBe('update');

		const fm = frontmatterOf(proposal);
		expect(fm.summary).toBe('a: b: c');     // colon value preserved (hand-rolled YAML corrupts this)
		expect(fm.tags).toEqual(['x', 'y']);
		expect(fm.meta).toEqual({ k: 1 });        // real nested YAML, not a JSON string
		expect(fm.title).toBe('Old');             // existing property merged
		expect(proposal.proposedContent).toContain('Body'); // body preserved
	});

	it('emits no frontmatter block when all properties are removed', async () => {
		const tool = new UpdatePropertiesTool(mockApp('---\ntitle: Old\n---\nBody text', { title: 'Old' }));

		const res = await tool.execute({ path: 'note.md', updates: {}, deleteKeys: ['title'] });

		const proposal = res.result as WriteProposal;
		expect(proposal.proposedContent).not.toContain('---');
		expect(proposal.proposedContent).toContain('Body text');
	});
});
