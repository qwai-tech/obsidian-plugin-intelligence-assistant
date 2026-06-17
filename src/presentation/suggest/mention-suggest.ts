import { AbstractInputSuggest, type App, TFile } from 'obsidian';

/**
 * @-mention / [[wikilink autocomplete for the chat input.
 *
 * Typing `@foo` or `[[foo` in the chat textarea pops a suggestion list of vault
 * markdown notes whose basename matches `foo`; selecting one inserts a
 * `[[basename]]` wikilink in place of the trigger token. Built on Obsidian's
 * `AbstractInputSuggest`, the right primitive for a plugin's own input element.
 *
 * The chat input is a `<textarea>`; AbstractInputSuggest reads `.value` (which
 * textareas have) and we own the token extraction + caret-aware insertion so the
 * behaviour is correct for multi-line input.
 */

/** A trigger token (the active @ or [[ fragment) located before the caret. */
export interface MentionToken {
	/** The query text after the trigger (e.g. `foo` for `@foo`). */
	query: string;
	/** Index in the text where the trigger char(s) start (inclusive). */
	start: number;
	/** Index in the text where the query ends (== caret position). */
	end: number;
	/** Which trigger fired. */
	kind: '@' | '[[';
}

/**
 * Locate an active mention token ending at `caret`. Returns null when the caret
 * is not inside an `@…` or `[[…` fragment. A query may not contain whitespace or
 * a closing `]]` (which means the link is already complete).
 */
export function findMentionToken(text: string, caret: number): MentionToken | null {
	const before = text.slice(0, caret);

	// [[ wikilink trigger — prefer it over @ when both could match.
	const wikiIdx = before.lastIndexOf('[[');
	if (wikiIdx !== -1) {
		const frag = before.slice(wikiIdx + 2);
		if (!frag.includes(']]') && !frag.includes('\n')) {
			return { query: frag, start: wikiIdx, end: caret, kind: '[[' };
		}
	}

	// @ mention trigger. Must be at start or preceded by whitespace so emails
	// like a@b don't trigger it.
	const atIdx = before.lastIndexOf('@');
	if (atIdx !== -1) {
		const prev = atIdx === 0 ? '' : before[atIdx - 1];
		const frag = before.slice(atIdx + 1);
		if ((atIdx === 0 || /\s/.test(prev)) && !/\s/.test(frag)) {
			return { query: frag, start: atIdx, end: caret, kind: '@' };
		}
	}

	return null;
}

/**
 * Filter markdown files by basename (case-insensitive substring), ranking
 * prefix matches first, then by path. Capped at `limit`.
 */
export function filterFilesByQuery(files: TFile[], query: string, limit = 50): TFile[] {
	const q = query.toLowerCase().trim();
	const scored = files
		.map((file) => {
			const name = file.basename.toLowerCase();
			if (q === '') return { file, score: 1 };
			const idx = name.indexOf(q);
			if (idx === -1) return { file, score: -1 };
			// Prefix match scores best.
			return { file, score: idx === 0 ? 2 : 1 };
		})
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
	return scored.slice(0, limit).map((s) => s.file);
}

export class MentionSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		private textarea: HTMLTextAreaElement,
		/**
		 * Called when a note is picked. The host attaches the note as a chat
		 * reference so its CONTENT is sent to the model — without this, the inserted
		 * `[[link]]` is just text the agent can't resolve on its own.
		 */
		private onAttach?: (file: TFile) => void,
	) {
		// AbstractInputSuggest types its el as input|div; the textarea exposes the
		// same `.value` surface the base relies on.
		super(app, textarea as unknown as HTMLInputElement);
	}

	/** Current active token at the caret, or null. */
	private activeToken(): MentionToken | null {
		const caret = this.textarea.selectionStart ?? this.textarea.value.length;
		return findMentionToken(this.textarea.value, caret);
	}

	protected getSuggestions(_query: string): TFile[] {
		const token = this.activeToken();
		if (!token) return [];
		const files = this.app.vault.getMarkdownFiles();
		return filterFilesByQuery(files, token.query, this.limit || 50);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ cls: 'ia-mention-suggest__title', text: file.basename });
		el.createDiv({ cls: 'ia-mention-suggest__path', text: file.path });
	}

	selectSuggestion(file: TFile): void {
		const token = this.activeToken();
		const value = this.textarea.value;
		const link = this.app.fileManager.generateMarkdownLink(file, '', undefined, undefined)
			|| `[[${file.basename}]]`;

		if (token) {
			const replacement = `${link} `;
			const next = value.slice(0, token.start) + replacement + value.slice(token.end);
			this.textarea.value = next;
			const caret = token.start + replacement.length;
			this.textarea.setSelectionRange?.(caret, caret);
		} else {
			this.textarea.value = `${value}${link} `;
		}

		// Attach the note as a reference so the agent actually receives its content
		// (the inserted `[[link]]` alone is opaque text the model can't resolve).
		this.onAttach?.(file);

		// Notify listeners (autoresize, send-button enable) and close the popup.
		this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
		this.textarea.focus();
		this.close();
	}
}
