import { EditorState } from '@codemirror/state';
import { getPrimarySelectionText } from '@/presentation/editor/ai-selection-extension';

describe('getPrimarySelectionText', () => {
	it('returns the trimmed text of the primary selection', () => {
		const state = EditorState.create({
			doc: 'hello brave world',
			selection: { anchor: 6, head: 11 }, // "brave"
		});
		expect(getPrimarySelectionText(state)).toBe('brave');
	});

	it('returns an empty string when the selection is empty (just a caret)', () => {
		const state = EditorState.create({
			doc: 'hello world',
			selection: { anchor: 3, head: 3 },
		});
		expect(getPrimarySelectionText(state)).toBe('');
	});

	it('trims surrounding whitespace in the selected range', () => {
		const state = EditorState.create({
			doc: 'a   trimmed   b',
			selection: { anchor: 1, head: 14 }, // "   trimmed   "
		});
		expect(getPrimarySelectionText(state)).toBe('trimmed');
	});
});
