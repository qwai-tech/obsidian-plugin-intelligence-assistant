import { MarkdownView, type App, type Editor, type TFile } from 'obsidian';

export interface TextChange {
	start: number;
	end: number;
	text: string;
}

export function changedRange(current: string, next: string): TextChange | null {
	if (current === next) {
		return null;
	}
	const limit = Math.min(current.length, next.length);
	let start = 0;
	while (start < limit && current[start] === next[start]) {
		start += 1;
	}
	let suffix = 0;
	while (suffix < limit - start && current[current.length - 1 - suffix] === next[next.length - 1 - suffix]) {
		suffix += 1;
	}
	return { start, end: current.length - suffix, text: next.slice(start, next.length - suffix) };
}

export async function rewriteNote(app: App, file: TFile, rewrite: (current: string) => string): Promise<void> {
	const editor = openEditor(app, file);
	if (!editor) {
		await app.vault.process(file, rewrite);
		return;
	}
	const current = editor.getValue();
	const change = changedRange(current, rewrite(current));
	if (change) {
		editor.replaceRange(change.text, editor.offsetToPos(change.start), editor.offsetToPos(change.end));
	}
}

function openEditor(app: App, file: TFile): Editor | null {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
			return leaf.view.editor;
		}
	}
	return null;
}
