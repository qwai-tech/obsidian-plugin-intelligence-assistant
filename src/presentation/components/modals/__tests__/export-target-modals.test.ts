import { App, TFile } from 'obsidian';
import { TextInputModal } from '../text-input-modal';
import { SingleFileSelectionModal } from '../single-file-selection-modal';

const app = () => Object.assign(new App(), { vault: { getFiles: () => [] as TFile[] } }) as App;

describe('export target modals', () => {
	it('TextInputModal reports null when dismissed without submitting', () => {
		const onSubmit = jest.fn();
		const modal = new TextInputModal(app(), 'Title', 'Placeholder', 'Default', onSubmit);

		modal.onClose();

		expect(onSubmit).toHaveBeenCalledWith(null);
	});

	it('SingleFileSelectionModal reports null when dismissed without choosing', () => {
		const onChoose = jest.fn();
		const modal = new SingleFileSelectionModal(app(), onChoose);

		modal.onClose();

		expect(onChoose).toHaveBeenCalledWith(null);
	});
});
