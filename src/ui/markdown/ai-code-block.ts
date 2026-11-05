import { t } from '@/i18n';

/**
 * Inline AI widget rendered from a fenced ```ai code block.
 *
 * The processor parses the block source into a directive (prompt + options),
 * then renders a small widget: the prompt text, a result area, and a Run button
 * that hands the prompt to the agent path. We deliberately do NOT auto-run on
 * every preview render (that would fire the LLM on every scroll/re-render);
 * `autorun` metadata does not grant execution; the user must press Run.
 *
 * The parse + DOM-build logic is split out here so it can be unit-tested without
 * the Obsidian `Plugin` / MarkdownPostProcessor machinery.
 */

export interface AiBlockDirective {
	/** The prompt text the agent should act on. */
	prompt: string;
	/** Optional title shown on the widget header. */
	title?: string;
	/** Legacy metadata retained for parsing compatibility; never grants execution. */
	autorun: boolean;
	error?: string;
}

/**
 * Parse a fenced ```ai block body. Leading `key: value` option lines (before a
 * blank line, or inline `@key value` tokens) configure the widget; the rest is
 * the prompt. Recognised options: `title:`, `autorun: true|false`.
 */
export function parseAiBlock(source: string): AiBlockDirective {
	const lines = source.replace(/\r\n/g, '\n').split('\n');
	let title: string | undefined;
	let autorun = false;
	let error: string | undefined;
	let i = 0;

	// Consume a contiguous run of leading "key: value" option lines.
	const optionRe = /^([a-zA-Z][\w-]*)\s*:\s*(.*)$/;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') { i++; break; }
		const m = optionRe.exec(line.trim());
		if (!m) break;
		const key = m[1].toLowerCase();
		const value = m[2].trim();
		if (key === 'title') {
			title = value;
		} else if (key === 'autorun') {
			if (!['true', 'false'].includes(value.toLowerCase())) error = t('ux.invalidAutorun');
			autorun = value.toLowerCase() === 'true';
		} else {
			// Not a recognised option line — treat from here on as the prompt.
			break;
		}
	}

	const prompt = lines.slice(i).join('\n').trim();
	return { prompt, title, autorun, ...(error ? { error } : {}) };
}

export interface AiWidgetHandle {
	root: HTMLElement;
	promptEl: HTMLElement;
	resultEl: HTMLElement;
	runButton: HTMLButtonElement;
	/** Render a result string into the result area. */
	setResult(text: string): void;
	/** Reflect running / idle state on the widget. */
	setRunning(running: boolean): void;
}

/**
 * Build the widget DOM into `el`. `onRun` is invoked when the user clicks Run
 * only. Uses the Obsidian-augmented `createDiv`/`createEl`
 * helpers provided by Obsidian at runtime.
 */
export function buildAiWidget(
	el: HTMLElement,
	directive: AiBlockDirective,
	onRun: (prompt: string, handle: AiWidgetHandle) => void,
): AiWidgetHandle {
	const root = el.createDiv('ia-ai-block');

	const header = root.createDiv('ia-ai-block__header');
	header.createSpan({ cls: 'ia-ai-block__title', text: directive.title || 'AI' });
	const runButton = header.createEl('button', {
		cls: 'ia-ai-block__run',
		text: t('markdown.run'),
	});
	runButton.type = 'button';

	const promptEl = root.createDiv('ia-ai-block__prompt');
	promptEl.setText(directive.prompt);

	const resultEl = root.createDiv('ia-ai-block__result');
	resultEl.addClass('ia-hidden');
	resultEl.setAttribute('role', 'status');
	resultEl.setAttribute('aria-live', 'polite');

	const handle: AiWidgetHandle = {
		root,
		promptEl,
		resultEl,
		runButton,
		setResult(text: string) {
			resultEl.removeClass('ia-hidden');
			resultEl.setText(text);
		},
		setRunning(running: boolean) {
			runButton.disabled = running;
			runButton.setText(running ? t('ux.generating') : t('markdown.run'));
			root.setAttribute('aria-busy', String(running));
			root.toggleClass('is-running', running);
		},
	};

	const trigger = (): void => {
		if (directive.error) { handle.setResult(directive.error); return; }
		if (!directive.prompt) {
			handle.setResult(t('ux.noPrompt'));
			return;
		}
		onRun(directive.prompt, handle);
	};

	runButton.addEventListener('click', (e) => {
		e.preventDefault();
		trigger();
	});

	if (directive.error) {
		handle.setResult(directive.error);
		runButton.disabled = true;
	}
	// Legacy autorun metadata is parsed for compatibility; execution requires the existing Run button.

	return handle;
}
