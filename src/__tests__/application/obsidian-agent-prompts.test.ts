import {
	buildAskCurrentNotePrompt,
	buildImproveSelectionPrompt,
	buildOrganizeFolderPrompt,
	buildOrganizeCurrentNotePrompt,
	buildSummarizeCurrentNotePrompt,
	buildSummarizeFilePrompt,
} from '../../application/services/obsidian-agent-prompts';

describe('obsidian agent prompts', () => {
	it('builds a current-note question prompt with source and write safety', () => {
		const prompt = buildAskCurrentNotePrompt('Projects/AI.md', 'What should I do next?');

		expect(prompt).toContain('Projects/AI.md');
		expect(prompt).toContain('What should I do next?');
		expect(prompt).toContain('Use the referenced Obsidian note as the primary context');
		expect(prompt).toContain('Do not modify files unless I explicitly confirm');
	});

	it('builds a current-note summary prompt that asks for Obsidian links', () => {
		const prompt = buildSummarizeCurrentNotePrompt('Inbox/Reading.md');

		expect(prompt).toContain('Inbox/Reading.md');
		expect(prompt).toContain('Summarize the referenced Obsidian note');
		expect(prompt).toContain('Obsidian links');
		expect(prompt).toContain('Do not modify files unless I explicitly confirm');
	});

	it('builds a current-note organization prompt as a proposal, not a mutation', () => {
		const prompt = buildOrganizeCurrentNotePrompt('Areas/Product.md');

		expect(prompt).toContain('Areas/Product.md');
		expect(prompt).toContain('organization proposal');
		expect(prompt).toContain('proposed frontmatter/properties');
		expect(prompt).toContain('Do not modify files unless I explicitly confirm');
	});

	it('builds a selection improvement prompt with selected text', () => {
		const prompt = buildImproveSelectionPrompt('rough sentence', 'Drafts/Post.md');

		expect(prompt).toContain('Drafts/Post.md');
		expect(prompt).toContain('rough sentence');
		expect(prompt).toContain('Improve the selected text');
		expect(prompt).toContain('Only return the improved replacement text');
	});

	it('builds a file summary prompt with file path and safety instruction', () => {
		const prompt = buildSummarizeFilePrompt('Research/Paper.md');

		expect(prompt).toContain('Research/Paper.md');
		expect(prompt).toContain('Summarize the referenced Obsidian file');
		expect(prompt).toContain('Do not modify files unless I explicitly confirm');
	});

	it('builds a folder organization prompt as a review queue', () => {
		const prompt = buildOrganizeFolderPrompt('Inbox');

		expect(prompt).toContain('Inbox');
		expect(prompt).toContain('review queue');
		expect(prompt).toContain('Do not modify files unless I explicitly confirm');
	});
});
