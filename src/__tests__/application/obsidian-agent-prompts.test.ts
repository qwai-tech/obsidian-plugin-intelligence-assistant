import {
	buildAskCurrentNotePrompt,
	buildBacklinkTagDoctorPrompt,
	buildDuplicateMergePrompt,
	buildImproveSelectionPrompt,
	buildProjectBriefPrompt,
	buildRelatedNotesPrompt,
	buildOrganizeFolderPrompt,
	buildOrganizeCurrentNotePrompt,
	buildResearchBriefPrompt,
	buildSourceGroundedQuestionPrompt,
	buildSummarizeCurrentNotePrompt,
	buildSummarizeFilePrompt,
	buildVaultDiagnosisPrompt,
	buildWeeklyReviewPrompt,
	buildWritingDraftPrompt,
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
		expect(prompt).toContain('call create_note or write_file');
		expect(prompt).toContain('inside folder "Inbox"');
	});

	it('builds a project brief prompt with project status and next actions', () => {
		const prompt = buildProjectBriefPrompt('Projects/Agent.md');

		expect(prompt).toContain('Projects/Agent.md');
		expect(prompt).toContain('project brief');
		expect(prompt).toContain('next actions grouped by priority');
		expect(prompt).toContain('proposal/review queue');
		expect(prompt).toContain('inside folder "Projects"');
		expect(prompt).toContain('Project brief - Agent');
	});

	it('builds a weekly review prompt over daily and project notes', () => {
		const prompt = buildWeeklyReviewPrompt('this week');

		expect(prompt).toContain('weekly review');
		expect(prompt).toContain('this week');
		expect(prompt).toContain('daily notes');
		expect(prompt).toContain('Do not modify files unless I explicitly confirm');
	});

	it('builds a research brief prompt with a corpus and topic', () => {
		const prompt = buildResearchBriefPrompt('Research/Agents', 'Agentic RAG');

		expect(prompt).toContain('Research/Agents');
		expect(prompt).toContain('Agentic RAG');
		expect(prompt).toContain('research brief');
		expect(prompt).toContain('missing evidence');
		expect(prompt).toContain('call create_note or write_file');
		expect(prompt).toContain('inside folder "Research/Agents"');
	});

	it('builds a related notes prompt with backlink proposals', () => {
		const prompt = buildRelatedNotesPrompt('Ideas/MCP.md');

		expect(prompt).toContain('Ideas/MCP.md');
		expect(prompt).toContain('Find related notes');
		expect(prompt).toContain('missing backlinks');
		expect(prompt).toContain('proposed');
	});

	it('builds a duplicate merge prompt as a merge review queue', () => {
		const prompt = buildDuplicateMergePrompt('Archive');

		expect(prompt).toContain('Archive');
		expect(prompt).toContain('merge-worthy notes');
		expect(prompt).toContain('merge review queue');
		expect(prompt).toContain('exact edits/moves only as proposals');
	});

	it('builds a backlink and tag doctor prompt for a target note', () => {
		const prompt = buildBacklinkTagDoctorPrompt('Areas/Product.md');

		expect(prompt).toContain('Areas/Product.md');
		expect(prompt).toContain('links, tags, and properties');
		expect(prompt).toContain('missing backlinks');
		expect(prompt).toContain('grouped by file');
	});

	it('builds a writing draft prompt with source material and goal', () => {
		const prompt = buildWritingDraftPrompt('Research/Notes.md', 'Write a launch post');

		expect(prompt).toContain('Research/Notes.md');
		expect(prompt).toContain('Write a launch post');
		expect(prompt).toContain('outline');
		expect(prompt).toContain('claims that need stronger evidence');
		expect(prompt).toContain('inside folder "Research"');
	});

	it('builds a source-grounded question prompt that separates evidence from inference', () => {
		const prompt = buildSourceGroundedQuestionPrompt('What did I decide?', 'Projects/AI.md');

		expect(prompt).toContain('What did I decide?');
		expect(prompt).toContain('Projects/AI.md');
		expect(prompt).toContain('what the notes explicitly say');
		expect(prompt).toContain('what you infer');
	});

	it('builds a vault diagnosis prompt with a review queue', () => {
		const prompt = buildVaultDiagnosisPrompt();

		expect(prompt).toContain('vault health diagnosis');
		expect(prompt).toContain('retrieval quality');
		expect(prompt).toContain('quick wins');
		expect(prompt).toContain('review queue');
	});
});
