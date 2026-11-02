import { App, TFile } from 'obsidian';
import { PathPickerModal } from '@/ui/modals/path-picker-modal';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

export class SearchableImageModal extends PathPickerModal<TFile> {
	constructor(app: App, onChooseFiles: (files: TFile[]) => void) {
		super(app, {
			textKeys: 'chat.modals.image',
			modalClass: 'searchable-image-modal',
			itemClass: 'image-item',
			items: app.vault.getFiles().filter(file => IMAGE_EXTENSIONS.has(file.extension)),
			iconOf: () => 'image',
			onChoose: onChooseFiles,
		});
	}
}
