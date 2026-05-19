/**
 * Attachment Handler
 * Manages file and image attachments for chat messages
 */

import { App, Menu, Notice, TFile } from 'obsidian';
import { SearchableImageModal } from '@/presentation/components/modals/searchable-image-modal';
import { Attachment } from '@/types';
import { ChatViewState, StateChangeEvent } from '@/presentation/state/chat-view-state';

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
	attachFile(event?: MouseEvent): Promise<void> {
		// Get all markdown files in vault
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			new Notice('No files found in vault');
			return Promise.resolve();
		}

		// Create a simple file picker menu
		const menu = new Menu();
		files.slice(0, 20).forEach(file => {
			menu.addItem((item) => {
				item.setTitle(file.path)
					.setIcon('document')
					.onClick(() => {
						void (async () => {
							const content = await this.app.vault.read(file);
							this.state.addAttachment({
								type: 'file',
								name: file.name,
								path: file.path,
								content: content
							});
							new Notice(`Attached: ${file.name}`);
						})();
					});
			});
		});

		if (event) {
			menu.showAtMouseEvent(event);
		} else {
			menu.showAtPosition({ x: 0, y: 0 });
		}

		return Promise.resolve();
	}

	/**
	 * Show image attachment picker
	 */
	attachImage(): Promise<void> {
		new SearchableImageModal(this.app, (selectedFiles: TFile[]) => {
			void (async () => {
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
			})();
		}).open();
		return Promise.resolve();
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
		this.attachmentContainer.addClass('ia-attachment-preview-active');

		this.state.currentAttachments.forEach((att, index) => {
			const attPreview = this.attachmentContainer!.createDiv('attachment-preview-item');
			attPreview.addClass('ia-attachment-card');

			if (att.type === 'image' && att.content) {
				const img = attPreview.createEl('img');
				img.src = att.content;
				img.alt = att.name;
				img.addClass('ia-attachment-thumb');
			} else {
				attPreview.createSpan({ text: att.type === 'image' ? '🖼️' : '📎' });
			}

			attPreview.createSpan({ text: att.name });

			// Remove button
			const removeBtn = attPreview.createEl('button', { text: '×' });
			removeBtn.addClass('ia-attachment-remove-btn');
			removeBtn.addClass('ia-clickable');
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
