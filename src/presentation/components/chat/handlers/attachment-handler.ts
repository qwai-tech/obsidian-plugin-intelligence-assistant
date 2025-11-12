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
		this.searchInput.style.width = '100%';
		this.searchInput.style.marginBottom = '12px';
		this.searchInput.style.padding = '8px';
		this.searchInput.addEventListener('input', () => this.renderResults());

		// Results container
		this.resultsContainer = contentEl.createDiv('image-results');
		this.resultsContainer.style.maxHeight = '400px';
		this.resultsContainer.style.overflowY = 'auto';
		this.resultsContainer.style.marginBottom = '12px';

		// Buttons
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '8px';
		buttonContainer.style.justifyContent = 'flex-end';

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
			item.style.padding = '8px';
			item.style.cursor = 'pointer';
			item.style.borderRadius = '4px';
			item.style.marginBottom = '4px';

			if (this.selectedFiles.includes(file)) {
				item.style.background = 'var(--interactive-accent)';
				item.style.color = 'var(--text-on-accent)';
			} else {
				item.style.background = 'var(--background-secondary)';
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
					item.style.background = 'var(--background-modifier-hover)';
				}
			});

			item.addEventListener('mouseleave', () => {
				if (!this.selectedFiles.includes(file)) {
					item.style.background = 'var(--background-secondary)';
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
		this.attachmentContainer.style.display = 'none';

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
			this.attachmentContainer.style.display = 'none';
			return;
		}

		this.attachmentContainer.style.display = 'flex';
		this.attachmentContainer.style.gap = '8px';
		this.attachmentContainer.style.padding = '8px';
		this.attachmentContainer.style.background = 'var(--background-secondary)';
		this.attachmentContainer.style.borderRadius = '4px';
		this.attachmentContainer.style.flexWrap = 'wrap';
		this.attachmentContainer.style.marginBottom = '8px';

		this.state.currentAttachments.forEach((att, index) => {
			const attPreview = this.attachmentContainer!.createDiv('attachment-preview-item');
			attPreview.style.position = 'relative';
			attPreview.style.padding = '8px';
			attPreview.style.background = 'var(--background-primary)';
			attPreview.style.borderRadius = '4px';
			attPreview.style.display = 'flex';
			attPreview.style.alignItems = 'center';
			attPreview.style.gap = '8px';

			if (att.type === 'image' && att.content) {
				const img = attPreview.createEl('img');
				img.src = att.content;
				img.alt = att.name;
				img.style.width = '40px';
				img.style.height = '40px';
				img.style.objectFit = 'cover';
				img.style.borderRadius = '4px';
			} else {
				attPreview.createSpan({ text: att.type === 'image' ? '🖼️' : '📎' });
			}

			attPreview.createSpan({ text: att.name });

			// Remove button
			const removeBtn = attPreview.createEl('button', { text: '×' });
			removeBtn.style.marginLeft = 'auto';
			removeBtn.style.padding = '0 6px';
			removeBtn.style.border = 'none';
			removeBtn.style.background = 'transparent';
			removeBtn.style.cursor = 'pointer';
			removeBtn.style.fontSize = '20px';
			removeBtn.style.color = 'var(--text-error)';
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
