import { App, TFile, Modal } from 'obsidian';
import { t } from '@/i18n';

export class SearchableImageModal extends Modal {
	private onChooseFiles: (files: TFile[]) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allImageFiles: TFile[];
	private selectedFiles: TFile[] = [];

	constructor(app: App, onChooseFiles: (files: TFile[]) => void) {
		super(app);
		this.onChooseFiles = onChooseFiles;

		const files = app.vault.getFiles();
		this.allImageFiles = files.filter(f =>
			f.extension === 'png' || f.extension === 'jpg' ||
			f.extension === 'jpeg' || f.extension === 'gif' || f.extension === 'webp'
		);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('searchable-image-modal');

		contentEl.createEl('h2', { text: t('chat.modals.image.title') });

		this.searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: t('chat.modals.image.searchPlaceholder')
		});
		this.searchInput.addClass('ia-modal-search-input');

		this.resultsContainer = contentEl.createDiv('ia-modal-results');

		this.displayImages(this.allImageFiles);

		this.searchInput.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			const filteredFiles = this.allImageFiles.filter((file: TFile) =>
				file.path.toLowerCase().includes(query)
			);
			this.displayImages(filteredFiles);
		});

		this.searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.selectedFiles.length > 0) {
				this.close();
				this.onChooseFiles(this.selectedFiles);
			}
		});

		const buttonContainer = contentEl.createDiv('ia-modal-btn-row');

		const selectAllButton = buttonContainer.createEl('button', { text: t('chat.modals.image.selectAll') });
		selectAllButton.addEventListener('click', () => {
			this.selectedFiles = [...this.allImageFiles];
			this.updateDisplay();
		});

		const selectNoneButton = buttonContainer.createEl('button', { text: t('chat.modals.image.selectNone') });
		selectNoneButton.addEventListener('click', () => {
			this.selectedFiles = [];
			this.updateDisplay();
		});

		const addButton = buttonContainer.createEl('button', { text: t('chat.modals.image.addSelected') });
		addButton.addClass('mod-cta');
		addButton.addEventListener('click', () => {
			this.close();
			this.onChooseFiles(this.selectedFiles);
		});
	}

	private displayImages(files: TFile[]) {
		this.resultsContainer.empty();

		if (files.length === 0) {
			this.resultsContainer.createDiv({ text: t('chat.modals.image.noResults') });
			return;
		}

		files.forEach(file => {
			const itemEl = this.resultsContainer.createDiv('image-item ia-modal-list-item');
			itemEl.addClass('ia-clickable');

			if (this.selectedFiles.some(selected => selected.path === file.path)) {
				itemEl.addClass('ia-modal-item--selected');
			}

			const iconEl = itemEl.createDiv('ia-modal-list-icon');
			iconEl.setText('🖼️');

			const textEl = itemEl.createDiv('ia-flex-1');
			textEl.setText(file.path);

			itemEl.addEventListener('click', () => {
				const isSelected = this.selectedFiles.some(selected => selected.path === file.path);
				if (isSelected) {
					this.selectedFiles = this.selectedFiles.filter(selected => selected.path !== file.path);
				} else {
					this.selectedFiles.push(file);
				}
				this.updateDisplay();
			});
		});
	}

	private updateDisplay() {
		const query = this.searchInput.value.toLowerCase();
		const currentFiles = this.allImageFiles.filter((file: TFile) =>
			file.path.toLowerCase().includes(query)
		);
		this.displayImages(currentFiles);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
