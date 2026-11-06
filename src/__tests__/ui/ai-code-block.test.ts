import { parseAiBlock, buildAiWidget } from '@/ui/markdown/ai-code-block';

// The widget uses Obsidian's HTMLElement.createDiv/createEl helpers, which the
// jest obsidian mock installs on HTMLElement.prototype.
import 'obsidian';
import { initI18n } from '@/i18n';

beforeAll(() => initI18n('en'));

describe('parseAiBlock', () => {
	it('parses a plain prompt with no options', () => {
		const d = parseAiBlock('Summarize my open tasks');
		expect(d).toEqual({ prompt: 'Summarize my open tasks', title: undefined, autorun: false });
	});

	it('parses leading title + autorun options before a blank line', () => {
		const d = parseAiBlock('title: Weekly Review\nautorun: true\n\nWrite my weekly review');
		expect(d.title).toBe('Weekly Review');
		expect(d.autorun).toBe(true);
		expect(d.prompt).toBe('Write my weekly review');
	});

	it('treats unknown leading lines as part of the prompt', () => {
		const d = parseAiBlock('What is in my vault about RAG?');
		expect(d.prompt).toBe('What is in my vault about RAG?');
		expect(d.autorun).toBe(false);
	});
});

describe('buildAiWidget', () => {
	it('builds prompt + result + run button DOM', () => {
		const el = document.createElement('div');
		const handle = buildAiWidget(el, { prompt: 'Do a thing', title: 'AI', autorun: false }, () => {});
		expect(handle.promptEl.textContent).toBe('Do a thing');
		expect(handle.runButton.textContent).toBe('Run');
		expect(el.querySelector('.ia-ai-block')).not.toBeNull();
	});

	it('invokes onRun when the run button is clicked', () => {
		const el = document.createElement('div');
		const onRun = jest.fn();
		const handle = buildAiWidget(el, { prompt: 'Go', autorun: false }, onRun);
		handle.runButton.click();
		expect(onRun).toHaveBeenCalledWith('Go', handle);
	});

	it('requires a Run click even for legacy autorun metadata', () => {
		const el = document.createElement('div');
		const onRun = jest.fn();
		const handle = buildAiWidget(el, { prompt: 'Auto', autorun: true }, onRun);
		expect(onRun).not.toHaveBeenCalled();
		handle.runButton.click();
		expect(onRun).toHaveBeenCalledTimes(1);
		expect(onRun).toHaveBeenCalledWith('Auto', expect.objectContaining({ runButton: expect.any(HTMLButtonElement) }));
	});

	it('passes the widget handle after an explicit Run click so progress can be displayed', () => {
		const el = document.createElement('div');
		const states: boolean[] = [];

		const handle = buildAiWidget(el, { prompt: 'Auto', autorun: true }, (_prompt, widget) => {
			widget.setRunning(true);
			states.push(widget.runButton.disabled);
		});

		expect(states).toEqual([]);
		handle.runButton.click();
		expect(states).toEqual([true]);
		expect(handle.runButton.disabled).toBe(true);
	});

	it('does not auto-run when there is no prompt', () => {
		const el = document.createElement('div');
		const onRun = jest.fn();
		buildAiWidget(el, { prompt: '', autorun: true }, onRun);
		expect(onRun).not.toHaveBeenCalled();
	});

	it('setRunning toggles the button disabled/label', () => {
		const el = document.createElement('div');
		const handle = buildAiWidget(el, { prompt: 'x', autorun: false }, () => {});
		handle.setRunning(true);
		expect(handle.runButton.disabled).toBe(true);
		handle.setRunning(false);
		expect(handle.runButton.disabled).toBe(false);
		expect(handle.runButton.textContent).toBe('Run');
	});
});
