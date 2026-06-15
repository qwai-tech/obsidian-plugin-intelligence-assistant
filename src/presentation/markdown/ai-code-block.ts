/**
 * Inline AI widget rendered from a fenced ```ai code block.
 *
 * The processor parses the block source into a directive (prompt + options),
 * then renders a small widget: the prompt text, a result area, and a Run button
 * that hands the prompt to the agent path. We deliberately do NOT auto-run on
 * every preview render (that would fire the LLM on every scroll/re-render);
 * `autorun: true` is honoured only as an explicit opt-in.
 *
 * The parse + DOM-build logic is split out here so it can be unit-tested without
 * the Obsidian `Plugin` / MarkdownPostProcessor machinery.
 */

export interface AiBlockDirective {
	/** The prompt text the agent should act on. */
	prompt: string;
	/** Optional title shown on the widget header. */
	title?: string;
	/** Explicit opt-in to run automatically when the block first renders. */
	autorun: boolean;
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
			autorun = value.toLowerCase() === 'true';
		} else {
			// Not a recognised option line — treat from here on as the prompt.
			break;
		}
	}

	const prompt = lines.slice(i).join('\n').trim();
	return { prompt, title, autorun };
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
 * (or once on autorun). Uses the Obsidian-augmented `createDiv`/`createEl`
 * helpers that exist on HTMLElement at runtime and in the jest obsidian mock.
 */
export function buildAiWidget(
	el: HTMLElement,
	directive: AiBlockDirective,
	onRun: (prompt: string) => void,
): AiWidgetHandle {
	const root = el.createDiv('ia-ai-block');

	const header = root.createDiv('ia-ai-block__header');
	header.createSpan({ cls: 'ia-ai-block__title', text: directive.title || 'AI' });
	const runButton = header.createEl('button', {
		cls: 'ia-ai-block__run',
		text: 'Run',
	});
	runButton.type = 'button';

	const promptEl = root.createDiv('ia-ai-block__prompt');
	promptEl.setText(directive.prompt);

	const resultEl = root.createDiv('ia-ai-block__result');
	resultEl.addClass('ia-hidden');

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
			runButton.setText(running ? 'Running…' : 'Run');
			root.toggleClass('is-running', running);
		},
	};

	const trigger = (): void => {
		if (!directive.prompt) {
			handle.setResult('No prompt provided in the ai block.');
			return;
		}
		onRun(directive.prompt);
	};

	runButton.addEventListener('click', (e) => {
		e.preventDefault();
		trigger();
	});

	if (directive.autorun && directive.prompt) {
		trigger();
	}

	return handle;
}
