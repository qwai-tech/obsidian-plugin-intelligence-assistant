import type { Setting } from 'obsidian';

/** Full-width, soft-wrapped editing for non-secret paths, URLs and arguments. */
export function readableTextField(
	setting: Setting,
	value: string,
	onChange: (value: string) => void,
	options: { placeholder?: string; rows?: number; testId?: string } = {},
): HTMLTextAreaElement {
	setting.settingEl.addClass('ia-readable-field');
	let input!: HTMLTextAreaElement;
	setting.addTextArea(text => {
		input = text.inputEl;
		input.rows = options.rows ?? 2;
		input.spellcheck = false;
		input.setAttribute('wrap', 'soft');
		input.setAttribute('aria-label', setting.nameEl.textContent?.trim() || '');
		if (options.testId) input.setAttribute('data-testid', options.testId);
		text.setValue(value).setPlaceholder(options.placeholder ?? '').onChange(onChange);
	});
	return input;
}
