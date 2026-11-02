import { App } from 'obsidian';
import { PathPickerModal } from '@/ui/modals/path-picker-modal';
import { initI18n } from '@/i18n';

interface Note { path: string }

const NOTES: Note[] = [{ path: 'qa-source.md' }, { path: 'qa-source-two.md' }, { path: 'other.md' }];

function openPicker(onChoose: (items: Note[]) => void = jest.fn()): PathPickerModal<Note> {
	const modal = new PathPickerModal<Note>(new App() as never, {
		textKeys: 'chat.modals.reference',
		modalClass: 'searchable-reference-modal',
		itemClass: 'reference-item',
		items: NOTES,
		iconOf: () => 'file-text',
		onChoose,
	});
	modal.onOpen();
	return modal;
}

const rows = (modal: PathPickerModal<Note>) => Array.from(modal.contentEl.querySelectorAll<HTMLElement>('.ia-modal-list-item'));
const button = (modal: PathPickerModal<Note>, text: string) => Array.from(modal.contentEl.querySelectorAll('button')).find(candidate => candidate.textContent === text)!;

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
});
