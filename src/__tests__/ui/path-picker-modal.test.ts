import { App } from 'obsidian';
import { PathPickerModal } from '@/ui/modals/path-picker-modal';
import { initI18n } from '@/i18n';

interface Note { path: string }

const NOTES: Note[] = [{ path: 'qa-source.md' }, { path: 'qa-source-two.md' }, { path: 'other.md' }];

function openPicker(onChoose: (items: Note[]) => void = jest.fn()): PathPickerModal<Note> {
	const modal = new PathPickerModal<Note>(new App() as never, {
		textKeys: 'chat.modals.reference',
		modalClass: 'searchable-reference-modal',
		items: NOTES,
		iconOf: () => 'file-text',
		onChoose,
	});
	modal.onOpen();
	return modal;
}

const rows = (modal: PathPickerModal<Note>) => Array.from(modal.contentEl.querySelectorAll<HTMLElement>('.ia-modal-list-item'));
const button = (modal: PathPickerModal<Note>, text: string) => Array.from(modal.contentEl.querySelectorAll('button')).find(candidate => candidate.textContent === text || candidate.textContent?.startsWith(`${text} (`))!;

function search(modal: PathPickerModal<Note>, query: string): void {
	const input = modal.contentEl.querySelector('input')!;
	input.value = query;
	input.dispatchEvent(new Event('input'));
}

describe('PathPickerModal', () => {
	beforeAll(() => initI18n('en'));

	it('lists the items matching the search', () => {
		const modal = openPicker();

		search(modal, 'qa-source');

		expect(rows(modal).map(row => row.textContent)).toEqual(['qa-source.md', 'qa-source-two.md']);
	});

	it('adds the clicked items', () => {
		const onChoose = jest.fn();
		const modal = openPicker(onChoose);

		rows(modal)[1].click();
		button(modal, 'Add selected').click();

		expect(onChoose).toHaveBeenCalledWith([{ path: 'qa-source-two.md' }]);
	});

	it('exposes the results as a multi-select list of focusable options', () => {
		const modal = openPicker();

		const list = modal.contentEl.querySelector('.ia-modal-results')!;
		expect(list.getAttribute('role')).toBe('listbox');
		expect(list.getAttribute('aria-multiselectable')).toBe('true');
		expect(rows(modal).map(row => [row.getAttribute('role'), row.tabIndex, row.getAttribute('aria-selected')])).toEqual([
			['option', 0, 'false'], ['option', 0, 'false'], ['option', 0, 'false'],
		]);
	});

	it.each([' ', 'Enter'])('selects the focused result with %j and keeps focus on it', (key) => {
		const onChoose = jest.fn();
		const modal = openPicker(onChoose);
		document.body.appendChild(modal.contentEl);
		const row = rows(modal)[1];
		row.focus();

		row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

		expect(row.getAttribute('aria-selected')).toBe('true');
		expect(document.activeElement).toBe(row);
		button(modal, 'Add selected').click();
		expect(onChoose).toHaveBeenCalledWith([{ path: 'qa-source-two.md' }]);
		modal.contentEl.remove();
	});

	it('moves focus between results with the arrow keys', () => {
		const modal = openPicker();
		document.body.appendChild(modal.contentEl);
		const [first, second] = rows(modal);
		first.focus();

		first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toBe(second);

		second.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		expect(document.activeElement).toBe(first);
		modal.contentEl.remove();
	});

	it('selects only the results matching the search when selecting all', () => {
		const onChoose = jest.fn();
		const modal = openPicker(onChoose);
		search(modal, 'qa-source');

		button(modal, 'Select all').click();
		button(modal, 'Add selected').click();

		expect(onChoose).toHaveBeenCalledWith([{ path: 'qa-source.md' }, { path: 'qa-source-two.md' }]);
	});

	it('keeps earlier selections hidden by the search when selecting all', () => {
		const onChoose = jest.fn();
		const modal = openPicker(onChoose);
		rows(modal)[2].click();
		search(modal, 'qa-source');

		button(modal, 'Select all').click();
		button(modal, 'Add selected').click();

		expect(onChoose).toHaveBeenCalledWith([{ path: 'other.md' }, { path: 'qa-source.md' }, { path: 'qa-source-two.md' }]);
	});

	it('marks selected results and counts them on the add button', () => {
		const modal = openPicker();

		rows(modal)[0].click();
		rows(modal)[2].click();

		expect(rows(modal).map(row => row.querySelector('.ia-modal-list-check')?.childElementCount ?? 0).map(count => count > 0)).toEqual([true, false, true]);
		expect(button(modal, 'Add selected (2)')).toBeDefined();
		expect(rows(modal).some(row => row.classList.contains('reference-item'))).toBe(false);
	});
});
