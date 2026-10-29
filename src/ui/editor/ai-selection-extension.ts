import { keymap } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import { editorInfoField } from 'obsidian';

/**
 * Pure helper: given a CodeMirror EditorState, return the trimmed text of the
 * primary selection (empty string when there is no non-whitespace selection).
 * Extracted so the selection-extraction logic is unit-testable without a live
 * EditorView. Works against any object that exposes the small slice of the CM6
 * state surface we use (`state.selection.main` + `state.sliceDoc`).
 */
export function getPrimarySelectionText(
	state: Pick<EditorState, 'selection' | 'sliceDoc'>,
): string {
	const range = state.selection.main;
	if (range.empty) return '';
	return state.sliceDoc(range.from, range.to).trim();
}

/**
 * Callback invoked when the user triggers the inline AI quick-action. Receives the
 * trimmed selection text and (when resolvable) the path of the file being edited.
 */
export type AiSelectionHandler = (selection: string, sourcePath: string | undefined) => void;

/**
 * Resolve the source-file path from a CM6 view by reading Obsidian's
 * `editorInfoField`. Returns undefined when the field/file is unavailable (e.g. a
 * non-Obsidian editor or a unit-test environment where the field isn't present).
 */
function resolveSourcePath(view: EditorView): string | undefined {
	if (!editorInfoField) return undefined;
	try {
		const info = view.state.field(editorInfoField, false);
		return info?.file?.path ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Build a real CodeMirror 6 editor extension: a keymap binding (Mod-Shift-I) that
 * sends the current selection to the supplied handler. Safe — it only acts when
 * there is a non-empty selection and never mutates the document, so normal editing
 * is unaffected. The pure selection-extraction logic lives in
 * {@link getPrimarySelectionText}, which is unit-tested; the keymap wiring around
 * it is exercised by Obsidian at runtime.
 */
export function aiSelectionEditorExtension(handler: AiSelectionHandler): Extension {
	return keymap.of([
		{
			key: 'Mod-Shift-i',
			preventDefault: true,
			run: (view: EditorView): boolean => {
				const selection = getPrimarySelectionText(view.state);
				if (!selection) return false;
				handler(selection, resolveSourcePath(view));
				return true;
			},
		},
	]);
}
