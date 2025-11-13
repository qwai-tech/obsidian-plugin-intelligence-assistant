/**
 * Attachment Handler
 * Manages file and image attachments for chat messages
 */

import { App, Menu, Modal, Notice, TFile } from 'obsidian';
import { Attachment } from '@/types';
import { ChatViewState, StateChangeEvent } from '@/presentation/state/chat-view-state';

/**
 * Modal for selecting images from vault
 */
class SearchableImageModal extends Modal {
	private onChooseFiles: (files: TFile[]) => void;
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private allImageFiles: TFile[];
	private selectedFiles: TFile[] = [];

	constructor(app: App, onChooseFiles: (files: TFile[]) => void) {
		super(app);
		this.onChooseFiles = onChooseFiles;
		this.allImageFiles = this.app.vault.getFiles().filter(file => {
			const ext = file.extension.toLowerCase();
			return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('image-picker-modal');

		contentEl.createEl('h2', { text: 'Select Images' });

		// Search input
		this.searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search images...'
		});
		this.searchInput.setCssProps({ 'width': '100%' });
		this.searchInput.setCssProps({ 'margin-bottom': '12px' });
		this.searchInput.setCssProps({ 'padding': '8px' });
		this.searchInput.addEventListener('input', () => this.renderResults());

		// Results container
		this.resultsContainer = contentEl.createDiv('image-results');
		this.resultsContainer.setCssProps({ 'max-height': '400px' });
		this.resultsContainer.setCssProps({ 'overflow-y': 'auto' });
		this.resultsContainer.setCssProps({ 'margin-bottom': '12px' });

		// Buttons
		const buttonContainer = contentEl.createDiv();
		buttonContainer.removeClass('ia-hidden');
		buttonContainer.setCssProps({ 'gap': '8px' });
		buttonContainer.setCssProps({ 'justify-content': 'flex-end' });

		const selectBtn = buttonContainer.createEl('button', { text: 'Select' });
		selectBtn.addEventListener('click', () => {
			this.onChooseFiles(this.selectedFiles);
			this.close();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		this.renderResults();
	}

	private renderResults() {
		this.resultsContainer.empty();

		const query = this.searchInput.value.toLowerCase();
		const filtered = query
			? this.allImageFiles.filter(file => file.path.toLowerCase().includes(query))
			: this.allImageFiles;

		if (filtered.length === 0) {
			this.resultsContainer.createDiv({ text: 'No images found' });
			return;
		}

		filtered.slice(0, 50).forEach(file => {
			const item = this.resultsContainer.createDiv('image-item');
			item.setCssProps({ 'padding': '8px' });
			item.addClass('ia-clickable');
			item.setCssProps({ 'border-radius': '4px' });
			item.setCssProps({ 'margin-bottom': '4px' });

			if (this.selectedFiles.includes(file)) {
				item.setCssProps({ 'background': 'var(--interactive-accent)' });
				item.setCssProps({ 'color': 'var(--text-on-accent)' });
			} else {
				item.setCssProps({ 'background': 'var(--background-secondary)' });
			}

			item.setText(`🖼️ ${file.path}`);

			item.addEventListener('click', () => {
				const index = this.selectedFiles.indexOf(file);
				if (index > -1) {
					this.selectedFiles.splice(index, 1);
				} else {
					this.selectedFiles.push(file);
				}
				this.renderResults();
			});

			item.addEventListener('mouseenter', () => {
				if (!this.selectedFiles.includes(file)) {
					item.setCssProps({ 'background': 'var(--background-modifier-hover)' });
				}
			});

			item.addEventListener('mouseleave', () => {
				if (!this.selectedFiles.includes(file)) {
					item.setCssProps({ 'background': 'var(--background-secondary)' });
				}
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Handles file and image attachments
 */
export class AttachmentHandler {
	private attachmentContainer: HTMLElement | null = null;

	constructor(
		private app: App,
		private state: ChatViewState
	) {}

	/**
	 * Initialize attachment container
	 */
	initializeContainer(container: HTMLElement): void {
		this.attachmentContainer = container.createDiv('attachment-preview');
		this.attachmentContainer.addClass('ia-hidden');

		// Listen to state changes to update preview
		this.state.on('state-change', (event: StateChangeEvent) => {
			if (event.field === 'currentAttachments') {
				this.updatePreview();
			}
		});
	}

	/**
	 * Show file attachment picker
	 */
	async attachFile(event?: MouseEvent): Promise<void> {
		// Get all markdown files in vault
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			new Notice('No files found in vault');
			return;
		}

		// Create a simple file picker menu
		const menu = new Menu();
		files.slice(0, 20).forEach(file => {
			menu.addItem((item) => {
				item.setTitle(file.path)
					.setIcon('document')
					.onClick(async () => {
						const content = await this.app.vault.read(file);
						this.state.addAttachment({
							type: 'file',
							name: file.name,
							path: file.path,
							content: content
						});
						new Notice(`Attached: ${file.name}`);
					});
			});
		});

		if (event) {
			menu.showAtMouseEvent(event);
		} else {
			menu.showAtPosition({ x: 0, y: 0 });
		}
	}

	/**
	 * Show image attachment picker
	 */
	async attachImage(): Promise<void> {
		new SearchableImageModal(this.app, async (selectedFiles: TFile[]) => {
			for (const file of selectedFiles) {
				const arrayBuffer = await this.app.vault.readBinary(file);
				const base64 = this.arrayBufferToBase64(arrayBuffer);
				const dataUrl = `data:image/${file.extension};base64,${base64}`;

				this.state.addAttachment({
					type: 'image',
					name: file.name,
					path: file.path,
					content: dataUrl
				});
			}
			if (selectedFiles.length > 0) {
				new Notice(`Attached ${selectedFiles.length} image(s)`);
			}
		}).open();
	}

	/**
	 * Update attachment preview UI
	 */
	private updatePreview(): void {
		if (!this.attachmentContainer) return;

		this.attachmentContainer.empty();

		if (this.state.currentAttachments.length === 0) {
			this.attachmentContainer.addClass('ia-hidden');
			return;
		}

		this.attachmentContainer.removeClass('ia-hidden');
		this.attachmentContainer.setCssProps({ 'gap': '8px' });
		this.attachmentContainer.setCssProps({ 'padding': '8px' });
		this.attachmentContainer.setCssProps({ 'background': 'var(--background-secondary)' });
		this.attachmentContainer.setCssProps({ 'border-radius': '4px' });
		this.attachmentContainer.setCssProps({ 'flex-wrap': 'wrap' });
		this.attachmentContainer.setCssProps({ 'margin-bottom': '8px' });

		this.state.currentAttachments.forEach((att, index) => {
			const attPreview = this.attachmentContainer!.createDiv('attachment-preview-item');
			attPreview.setCssProps({ 'position': 'relative' });
			attPreview.setCssProps({ 'padding': '8px' });
			attPreview.setCssProps({ 'background': 'var(--background-primary)' });
			attPreview.setCssProps({ 'border-radius': '4px' });
			attPreview.removeClass('ia-hidden');
			attPreview.setCssProps({ 'align-items': 'center' });
			attPreview.setCssProps({ 'gap': '8px' });

			if (att.type === 'image' && att.content) {
				const img = attPreview.createEl('img');
				img.src = att.content;
				img.alt = att.name;
				img.setCssProps({ 'width': '40px' });
				img.setCssProps({ 'height': '40px' });
				img.setCssProps({ 'object-fit': 'cover' });
				img.setCssProps({ 'border-radius': '4px' });
			} else {
				attPreview.createSpan({ text: att.type === 'image' ? '🖼️' : '📎' });
			}

			attPreview.createSpan({ text: att.name });

			// Remove button
			const removeBtn = attPreview.createEl('button', { text: '×' });
			removeBtn.setCssProps({ 'margin-left': 'auto' });
			removeBtn.setCssProps({ 'padding': '0 6px' });
			removeBtn.setCssProps({ 'border': 'none' });
			removeBtn.setCssProps({ 'background': 'transparent' });
			removeBtn.addClass('ia-clickable');
			removeBtn.setCssProps({ 'font-size': '20px' });
			removeBtn.setCssProps({ 'color': 'var(--text-error)' });
			removeBtn.addEventListener('click', () => {
				this.state.removeAttachment(index);
			});
		});
	}

	/**
	 * Convert ArrayBuffer to base64 string
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		let binary = '';
		const bytes = new Uint8Array(buffer);
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return window.btoa(binary);
	}

	/**
	 * Clear all attachments
	 */
	clearAttachments(): void {
		this.state.clearAttachments();
	}

	/**
	 * Get current attachments
	 */
	getAttachments(): Attachment[] {
		return this.state.currentAttachments;
	}
}
