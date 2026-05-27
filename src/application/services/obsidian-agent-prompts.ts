const SAFETY_INSTRUCTION = 'Do not modify files unless I explicitly confirm the proposed changes.';
const SOURCE_INSTRUCTION = 'Use the referenced Obsidian note as the primary context, and cite relevant notes with Obsidian links when useful.';

function normalizeQuestion(question: string): string {
	const trimmed = question.trim();
	return trimmed.length > 0 ? trimmed : 'What should I understand or do next?';
}

function formatPath(path: string): string {
	return path.trim() || 'current Obsidian note';
}

export function buildAskCurrentNotePrompt(path: string, question: string): string {
	const targetPath = formatPath(path);
	return [
		`${SOURCE_INSTRUCTION}`,
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
		`${SAFETY_INSTRUCTION}`,
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
		`${SAFETY_INSTRUCTION}`,
		'',
		`Create an organization review queue for folder: ${targetPath}.`,
		'',
		'Group proposed changes by file. Include suggested tags, properties, backlinks, moves, merges, and folder index/MOC candidates.',
		'Do not apply changes directly. Return a review queue I can approve item by item.',
	].join('\n');
}
