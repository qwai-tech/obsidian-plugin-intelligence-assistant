import { App, TFile, TFolder, Modal } from 'obsidian';
import { t } from '@/i18n';

export class SearchableReferenceModal extends Modal {
	private onChooseItems: (items: (TFile | TFolder)[]) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allItems: (TFile | TFolder)[];
	private selectedItems: (TFile | TFolder)[] = [];

	constructor(app: App, onChooseItems: (items: (TFile | TFolder)[]) => void) {
		super(app);
		this.onChooseItems = onChooseItems;

		const allFiles = app.vault.getAllLoadedFiles();
		this.allItems = allFiles.filter(f => f instanceof TFile || f instanceof TFolder);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('searchable-reference-modal');

		contentEl.createEl('h2', { text: t('chat.modals.reference.title') });

		this.searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: t('chat.modals.reference.searchPlaceholder')
		});
		this.searchInput.addClass('ia-modal-search-input');

		this.resultsContainer = contentEl.createDiv('ia-modal-results');

		this.displayItems(this.allItems);

		this.searchInput.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			const filteredItems = this.allItems.filter(item =>
				item.path.toLowerCase().includes(query)
			);
			this.displayItems(filteredItems);
		});

		this.searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.selectedItems.length > 0) {
				this.close();
				this.onChooseItems(this.selectedItems);
			}
		});

		const buttonContainer = contentEl.createDiv('ia-modal-btn-row');

		const selectAllButton = buttonContainer.createEl('button', { text: t('chat.modals.reference.selectAll') });
		selectAllButton.addEventListener('click', () => {
			this.selectedItems = [...this.allItems];
			this.updateDisplay();
		});

		const selectNoneButton = buttonContainer.createEl('button', { text: t('chat.modals.reference.selectNone') });
		selectNoneButton.addEventListener('click', () => {
			this.selectedItems = [];
			this.updateDisplay();
		});

		const addButton = buttonContainer.createEl('button', { text: t('chat.modals.reference.addSelected') });
		addButton.addClass('mod-cta');
		addButton.addEventListener('click', () => {
			this.close();
			this.onChooseItems(this.selectedItems);
		});
	}

	private displayItems(items: (TFile | TFolder)[]) {
		this.resultsContainer.empty();

		if (items.length === 0) {
			this.resultsContainer.createDiv({ text: t('chat.modals.reference.noResults') });
			return;
		}

		items.forEach(item => {
			const itemEl = this.resultsContainer.createDiv('reference-item ia-modal-list-item');
			itemEl.addClass('ia-clickable');

			if (this.selectedItems.some(selected => selected.path === item.path)) {
				itemEl.addClass('ia-modal-item--selected');
			}

			const iconEl = itemEl.createDiv('ia-modal-list-icon');
			iconEl.setText(item instanceof TFolder ? '📁' : '📄');

			const textEl = itemEl.createDiv('ia-flex-1');
			textEl.setText(item.path);

			itemEl.addEventListener('click', () => {
				const isSelected = this.selectedItems.some(selected => selected.path === item.path);
				if (isSelected) {
					this.selectedItems = this.selectedItems.filter(selected => selected.path !== item.path);
				} else {
					this.selectedItems.push(item);
				}
				this.updateDisplay();
			});
		});
	}

	private updateDisplay() {
		const query = this.searchInput.value.toLowerCase();
		const currentItems = this.allItems.filter(item =>
			item.path.toLowerCase().includes(query)
		);
		this.displayItems(currentItems);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
