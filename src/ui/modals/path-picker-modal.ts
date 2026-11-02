import { App, Modal, setIcon } from 'obsidian';
import { t } from '@/i18n';

export interface PathPickerOptions<T extends { path: string }> {
	textKeys: 'chat.modals.reference' | 'chat.modals.image';
	modalClass: string;
	itemClass: string;
	items: T[];
	iconOf: (item: T) => string;
	onChoose: (items: T[]) => void;
}

export class PathPickerModal<T extends { path: string }> extends Modal {
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private selected: T[] = [];
	private rowItems = new WeakMap<HTMLElement, T>();

	constructor(app: App, private readonly options: PathPickerOptions<T>) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass(this.options.modalClass);
		this.setTitle(this.text('title'));

		this.searchInput = contentEl.createEl('input', { type: 'text', placeholder: this.text('searchPlaceholder') });
		this.searchInput.addClass('ia-modal-search-input');
		this.resultsContainer = contentEl.createDiv({ cls: 'ia-modal-results', attr: { role: 'listbox', 'aria-multiselectable': 'true' } });
		this.resultsContainer.addEventListener('keydown', (e) => this.onResultKey(e));
		this.render();

		this.searchInput.addEventListener('input', () => this.render());
		this.searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this.selected.length > 0) {
				this.choose();
			}
		});

		const buttons = contentEl.createDiv('ia-modal-btn-row');
		buttons.createEl('button', { text: this.text('selectAll') }).addEventListener('click', () => {
			this.selected = [...this.selected, ...this.visibleItems().filter(item => !this.isSelected(item))];
			this.render();
		});
		buttons.createEl('button', { text: this.text('selectNone') }).addEventListener('click', () => {
			this.selected = [];
			this.render();
		});
		const add = buttons.createEl('button', { text: this.text('addSelected') });
		add.addClass('mod-cta');
		add.addEventListener('click', () => this.choose());
	}

	onClose() {
		this.contentEl.empty();
	}

	private visibleItems(): T[] {
		const query = this.searchInput.value.toLowerCase();
		return this.options.items.filter(item => item.path.toLowerCase().includes(query));
	}

	private render(): void {
		this.resultsContainer.empty();
		this.rowItems = new WeakMap();
		const items = this.visibleItems();
		if (items.length === 0) {
			this.resultsContainer.createDiv({ text: this.text('noResults') });
			return;
		}
		for (const item of items) {
			const row = this.resultsContainer.createDiv({ cls: `${this.options.itemClass} ia-modal-list-item ia-clickable`, attr: { role: 'option', tabindex: '0' } });
			this.rowItems.set(row, item);
			this.showSelection(row, item);
			setIcon(row.createDiv('ia-modal-list-icon'), this.options.iconOf(item));
			row.createDiv('ia-flex-1').setText(item.path);
			row.addEventListener('click', () => this.toggleRow(row));
		}
	}

	private onResultKey(e: KeyboardEvent): void {
		const row = e.target instanceof HTMLElement && this.rowItems.has(e.target) ? e.target : null;
		if (!row) return;
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			this.toggleRow(row);
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const sibling = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
			if (sibling instanceof HTMLElement) sibling.focus();
		}
	}

	private toggleRow(row: HTMLElement): void {
		const item = this.rowItems.get(row);
		if (!item) return;
		this.toggle(item);
		this.showSelection(row, item);
	}

	private showSelection(row: HTMLElement, item: T): void {
		const selected = this.isSelected(item);
		row.toggleClass('ia-modal-item--selected', selected);
		row.setAttr('aria-selected', String(selected));
	}

	private isSelected(item: T): boolean {
		return this.selected.some(selected => selected.path === item.path);
	}

	private toggle(item: T): void {
		this.selected = this.isSelected(item)
			? this.selected.filter(selected => selected.path !== item.path)
			: [...this.selected, item];
	}

	private choose(): void {
		this.close();
		this.options.onChoose(this.selected);
	}

	private text(key: string): string {
		return t(`${this.options.textKeys}.${key}`);
	}
}
