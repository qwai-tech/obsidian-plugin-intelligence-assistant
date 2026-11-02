import { App, TFile, TFolder } from 'obsidian';
import { PathPickerModal } from '@/ui/modals/path-picker-modal';

export class SearchableReferenceModal extends PathPickerModal<TFile | TFolder> {
	constructor(app: App, onChooseItems: (items: (TFile | TFolder)[]) => void) {
		super(app, {
			textKeys: 'chat.modals.reference',
			modalClass: 'searchable-reference-modal',
			itemClass: 'reference-item',
			items: app.vault.getAllLoadedFiles().filter((file): file is TFile | TFolder => file instanceof TFile || file instanceof TFolder),
			iconOf: item => item instanceof TFolder ? 'folder' : 'file-text',
			onChoose: onChooseItems,
		});
	}
}
