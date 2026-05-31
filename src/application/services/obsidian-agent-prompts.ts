const SAFETY_INSTRUCTION = 'Do not modify files unless I explicitly confirm the proposed changes.';
const SOURCE_INSTRUCTION = 'Use the referenced Obsidian note as the primary context, and cite relevant notes with Obsidian links when useful.';
const VAULT_AGENT_INSTRUCTION = 'Use available vault search/read tools when needed, distinguish observed note evidence from your inference, and cite Obsidian links for important claims.';
const PROPOSAL_INSTRUCTION = 'For any file edits, moves, merges, tags, properties, backlinks, or external actions, return a proposal/review queue instead of applying changes directly.';
const WRITE_ARTIFACT_INSTRUCTION = 'When the task asks for a durable artifact, call create_note or write_file so the UI can show a write proposal. Do not only paste the artifact in chat.';

function normalizeQuestion(question: string): string {
	const trimmed = question.trim();
	return trimmed.length > 0 ? trimmed : 'What should I understand or do next?';
}

function formatPath(path: string): string {
	return path.trim() || 'current Obsidian note';
}

function formatOptionalScope(scope?: string): string {
	const trimmed = scope?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : 'the current vault context';
}

function formatOutputFolder(path?: string): string {
	const trimmed = path?.trim();
	if (!trimmed) return '';
	if (trimmed.toLowerCase().endsWith('.md')) {
		return trimmed.split('/').slice(0, -1).join('/');
	}
	return trimmed;
}

function formatTargetName(path: string): string {
	const targetPath = formatPath(path);
	const name = targetPath.split('/').filter(Boolean).pop() ?? targetPath;
	return name.replace(/\.md$/i, '');
}

export function buildAskCurrentNotePrompt(path: string, question: string): string {
	const targetPath = formatPath(path);
	return [
		`${SOURCE_INSTRUCTION}`,
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		'',
		`Note: [[${targetPath}]]`,
		'',
		`Question: ${normalizeQuestion(question)}`,
	].join('\n');
}

export function buildSummarizeCurrentNotePrompt(path: string): string {
	const targetPath = formatPath(path);
	return [
		`${SOURCE_INSTRUCTION}`,
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		'',
		`Summarize the referenced Obsidian note: [[${targetPath}]].`,
		'',
		'Include:',
		'- key ideas',
		'- open questions',
		'- useful Obsidian links or backlinks to consider',
		'- suggested tags/properties as proposals only',
	].join('\n');
}

export function buildOrganizeCurrentNotePrompt(path: string): string {
	const targetPath = formatPath(path);
	return [
		`${SOURCE_INSTRUCTION}`,
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		'',
		`Create an organization proposal for the referenced Obsidian note: [[${targetPath}]].`,
		'',
		'Return:',
		'- proposed title changes, if any',
		'- proposed frontmatter/properties',
		'- proposed tags',
		'- proposed backlinks/outgoing links',
		'- proposed follow-up tasks',
	].join('\n');
}

export function buildImproveSelectionPrompt(selection: string, path?: string): string {
	const sourceLine = path?.trim()
		? `The selection comes from [[${path.trim()}]].`
		: 'The selection comes from the active Obsidian note.';
	return [
		sourceLine,
		'Improve the selected text for clarity, structure, and readability.',
		'Only return the improved replacement text.',
		'',
		'Selected text:',
		selection,
	].join('\n');
}

export function buildSummarizeFilePrompt(path: string): string {
	const targetPath = formatPath(path);
	return [
		`${SOURCE_INSTRUCTION}`,
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		'',
		`Summarize the referenced Obsidian file: [[${targetPath}]].`,
		'',
		'Focus on key points, decisions, unresolved questions, and useful links.',
	].join('\n');
}

export function buildOrganizeFolderPrompt(path: string): string {
	const targetPath = formatPath(path);
	return [
		'Use the referenced Obsidian folder as the primary context.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		`${WRITE_ARTIFACT_INSTRUCTION}`,
		'',
		`Create an organization review queue for folder: ${targetPath}.`,
		`Prepare the final review queue as a write proposal inside folder "${targetPath}" with title "Organization review queue - ${formatTargetName(targetPath)}".`,
		'',
		'Group proposed changes by file. Include suggested tags, properties, backlinks, moves, merges, and folder index/MOC candidates.',
		'Final answer should briefly summarize the proposed file path and ask me to apply the proposal in the UI.',
	].join('\n');
}

export function buildProjectBriefPrompt(path: string): string {
	const targetPath = formatPath(path);
	const outputFolder = formatOutputFolder(targetPath);
	return [
		'Use the referenced Obsidian note or folder as the primary project context.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		`${WRITE_ARTIFACT_INSTRUCTION}`,
		'',
		`Create a project brief for: [[${targetPath}]].`,
		`Prepare the final brief as a write proposal${outputFolder ? ` inside folder "${outputFolder}"` : ''} with title "Project brief - ${formatTargetName(targetPath)}".`,
		'',
		'Return:',
		'- project goal and current status',
		'- key decisions and evidence from notes',
		'- active workstreams',
		'- risks, blockers, and unknowns',
		'- next actions grouped by priority',
		'- proposed project index/status note updates, if useful',
		'Final answer should be short and point to the write proposal instead of duplicating the full brief.',
	].join('\n');
}

export function buildWeeklyReviewPrompt(scope?: string): string {
	const reviewScope = formatOptionalScope(scope);
	return [
		'Create a weekly review from my Obsidian vault.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		`${WRITE_ARTIFACT_INSTRUCTION}`,
		'',
		`Scope: ${reviewScope}.`,
		'Prepare the final review as a write proposal with title "Weekly review". If a Reviews folder exists, use it; otherwise use the vault root.',
		'',
		'Use daily notes, recent project notes, tasks, and referenced context when available.',
		'Return:',
		'- accomplishments',
		'- decisions made',
		'- open loops and blockers',
		'- commitments or tasks discovered in notes',
		'- next week plan',
		'- proposed updates to project/status notes, if useful',
		'Final answer should be short and point to the write proposal instead of duplicating the full review.',
	].join('\n');
}

export function buildResearchBriefPrompt(path: string, topic: string): string {
	const targetPath = formatPath(path);
	const outputFolder = formatOutputFolder(targetPath);
	const normalizedTopic = normalizeQuestion(topic);
	return [
		'Use the referenced Obsidian note or folder as the research corpus.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		`${WRITE_ARTIFACT_INSTRUCTION}`,
		'',
		`Research corpus: [[${targetPath}]]`,
		`Research question or topic: ${normalizedTopic}`,
		`Prepare the final research brief as a write proposal${outputFolder ? ` inside folder "${outputFolder}"` : ''} with title "Research brief - ${formatTargetName(targetPath)}".`,
		'',
		'Create a research brief with:',
		'- executive summary',
		'- key claims with note evidence',
		'- supporting examples or quotes summarized in your own words',
		'- disagreements, uncertainty, or missing evidence',
		'- reading queue / follow-up searches',
		'- proposed research note structure, if useful',
		'Final answer should be short and point to the write proposal instead of duplicating the full brief.',
	].join('\n');
}

export function buildRelatedNotesPrompt(path: string): string {
	const targetPath = formatPath(path);
	return [
		`${SOURCE_INSTRUCTION}`,
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		'',
		`Find related notes for: [[${targetPath}]].`,
		'',
		'Look for semantic similarity, backlinks, outgoing links, shared tags, shared entities, and project/task relationships.',
		'Return:',
		'- strongly related notes and why they matter',
		'- weak or surprising connections',
		'- missing backlinks that should be proposed',
		'- tags/properties that would improve retrieval',
	].join('\n');
}

export function buildDuplicateMergePrompt(path?: string): string {
	const scope = formatOptionalScope(path);
	return [
		'Find duplicate, overlapping, or merge-worthy notes in my Obsidian vault.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		'',
		`Scope: ${scope}.`,
		'',
		'Return a merge review queue with:',
		'- candidate notes',
		'- overlap summary',
		'- recommended canonical note',
		'- proposed merge outline',
		'- risks, conflicts, or information that must be preserved',
		'- exact edits/moves only as proposals',
	].join('\n');
}

export function buildBacklinkTagDoctorPrompt(path: string): string {
	const targetPath = formatPath(path);
	return [
		'Act as a vault hygiene Agent for links, tags, and properties.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		'',
		`Target: [[${targetPath}]]`,
		'',
		'Diagnose and propose improvements for:',
		'- missing backlinks',
		'- weak or inconsistent tags',
		'- useful frontmatter/properties',
		'- orphaned concepts that need links',
		'- broken or ambiguous references',
		'Return exact proposed changes grouped by file.',
	].join('\n');
}

export function buildWritingDraftPrompt(path: string, brief: string): string {
	const targetPath = formatPath(path);
	const outputFolder = formatOutputFolder(targetPath);
	const writingGoal = normalizeQuestion(brief);
	return [
		'Use the referenced Obsidian context as source material for writing.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		`${WRITE_ARTIFACT_INSTRUCTION}`,
		'',
		`Source context: [[${targetPath}]]`,
		`Writing goal: ${writingGoal}`,
		`Prepare the final draft as a write proposal${outputFolder ? ` inside folder "${outputFolder}"` : ''} with title "Draft - ${formatTargetName(targetPath)}".`,
		'',
		'Return:',
		'- intended audience and angle',
		'- outline',
		'- draft',
		'- claims that need stronger evidence',
		'- suggested source links to keep beside the draft',
		'- proposal for where to save or insert the draft, if useful',
		'Final answer should be short and point to the write proposal instead of duplicating the full draft.',
	].join('\n');
}

export function buildSourceGroundedQuestionPrompt(question: string, path?: string): string {
	const normalizedQuestion = normalizeQuestion(question);
	const scope = path?.trim() ? `Use [[${path.trim()}]] as the starting context.` : 'Use the vault as the starting context.';
	return [
		scope,
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		'',
		`Question: ${normalizedQuestion}`,
		'',
		'Answer with:',
		'- direct answer',
		'- supporting Obsidian links',
		'- what the notes explicitly say',
		'- what you infer',
		'- gaps or follow-up searches needed',
	].join('\n');
}

export function buildVaultDiagnosisPrompt(): string {
	return [
		'Run a vault health diagnosis as an Obsidian-native knowledge Agent.',
		`${VAULT_AGENT_INSTRUCTION}`,
		`${SAFETY_INSTRUCTION}`,
		`${PROPOSAL_INSTRUCTION}`,
		'',
		'Inspect structure, retrieval quality, link density, stale notes, duplicate themes, project status notes, daily notes, tags, and properties as available.',
		'Return:',
		'- overall health summary',
		'- top structural issues',
		'- quick wins',
		'- deeper cleanup projects',
		'- proposed files/folders to inspect next',
		'- exact changes only as a review queue',
	].join('\n');
}
