/**
 * Input Controller
 * Manages user input, attachments, and references
 */

import { Notice, Menu, TFile, TFolder } from 'obsidian';
import { BaseController } from './base-controller';
import type { Attachment, FileReference } from '@/types';

export class InputController extends BaseController {
	private inputElement: HTMLTextAreaElement | null = null;
	private attachmentPreviewElement: HTMLElement | null = null;

	async initialize(): Promise<void> {
		// Initialize input controller
	}

	cleanup(): void {
		this.inputElement = null;
		this.attachmentPreviewElement = null;
	}

	/**
	 * Set input element
	 */
	setInputElement(element: HTMLTextAreaElement): void {
		this.inputElement = element;
		this.setupInputHandlers();
	}

	/**
	 * Set attachment preview element
	 */
	setAttachmentPreviewElement(element: HTMLElement): void {
		this.attachmentPreviewElement = element;
	}

	/**
	 * Get current input value
	 */
	getInputValue(): string {
		return this.inputElement?.value || '';
	}

	/**
	 * Set input value
	 */
	setInputValue(value: string): void {
		if (this.inputElement) {
			this.inputElement.value = value;
			this.autoResizeInput();
		}
	}

	/**
	 * Clear input
	 */
	clearInput(): void {
		this.setInputValue('');
	}

	/**
	 * Focus input
	 */
	focusInput(): void {
		this.inputElement?.focus();
	}

	/**
	 * Setup input event handlers
	 */
	private setupInputHandlers(): void {
		if (!this.inputElement) return;

		// Auto-resize on input
		this.inputElement.addEventListener('input', () => {
			this.autoResizeInput();
		});

		// Enter to send (Shift+Enter for new line)
		this.inputElement.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.handleSendMessage();
			}
		});
	}

	/**
	 * Auto-resize textarea
	 */
	private autoResizeInput(): void {
		if (!this.inputElement) return;

		this.inputElement.style.height = 'auto';
		this.inputElement.style.height = `${Math.min(this.inputElement.scrollHeight, 200)}px`;
	}

	/**
	 * Handle send message
	 */
	private handleSendMessage(): void {
		const content = this.getInputValue();
		if (!content.trim()) return;

		// Emit send event
		this.state.trigger('send-message', { content });
		this.clearInput();
	}

	/**
	 * Attach file to message
	 */
	async attachFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const attachment: Attachment = {
			type: 'file',
			name: file.name,
			path: file.path,
			content
		};

		this.state.addAttachment(attachment);
		this.updateAttachmentPreview();
		new Notice(`Attached: ${file.name}`);
	}

	/**
	 * Attach image to message
	 */
	async attachImage(file: TFile): Promise<void> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		const base64 = this.arrayBufferToBase64(arrayBuffer);
		const dataUrl = `data:image/${file.extension};base64,${base64}`;

		const attachment: Attachment = {
			type: 'image',
			name: file.name,
			path: file.path,
			content: dataUrl
		};

		this.state.addAttachment(attachment);
		this.updateAttachmentPreview();
		new Notice(`Attached: ${file.name}`);
	}

	/**
	 * Add file reference
	 */
	addReference(file: TFile | TFolder): void {
		// Use addReferencedFile instead of addReference
		this.state.addReferencedFile(file);
		this.updateReferencePreview();
		new Notice(`Referenced: ${file.name}`);
	}

	/**
	 * Remove attachment
	 */
	removeAttachment(index: number): void {
		this.state.removeAttachment(index);
		this.updateAttachmentPreview();
	}

	/**
	 * Remove reference
	 */
	removeReference(index: number): void {
		this.state.removeReferencedFile(index);
		this.updateReferencePreview();
	}

	/**
	 * Clear all attachments
	 */
	clearAttachments(): void {
		this.state.clearAttachments();
		this.updateAttachmentPreview();
	}

	/**
	 * Clear all references
	 */
	clearReferences(): void {
		this.state.clearReferences();
		this.updateReferencePreview();
	}

	/**
	 * Update attachment preview
	 */
	private updateAttachmentPreview(): void {
		if (!this.attachmentPreviewElement) return;

		this.attachmentPreviewElement.empty();

		const attachments = this.state.currentAttachments;
		if (attachments.length === 0) {
			this.attachmentPreviewElement.style.display = 'none';
			return;
		}

		this.attachmentPreviewElement.style.display = 'flex';
		this.attachmentPreviewElement.style.gap = '8px';
		this.attachmentPreviewElement.style.padding = '8px';
		this.attachmentPreviewElement.style.background = 'var(--background-secondary)';

		attachments.forEach((attachment, index) => {
			const item = this.attachmentPreviewElement!.createDiv();
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.gap = '4px';
			item.style.padding = '4px 8px';
			item.style.background = 'var(--background-primary)';
			item.style.borderRadius = '4px';

			const icon = item.createSpan({ text: attachment.type === 'image' ? '🖼️' : '📎' });
			const name = item.createSpan({ text: attachment.name });
			name.style.fontSize = '0.9em';

			const removeBtn = item.createEl('button', { text: '×' });
			removeBtn.style.border = 'none';
			removeBtn.style.background = 'transparent';
			removeBtn.style.cursor = 'pointer';
			removeBtn.addEventListener('click', () => this.removeAttachment(index));
		});
	}

	/**
	 * Update reference preview
	 */
	private updateReferencePreview(): void {
		// Similar to attachment preview
		// Implementation depends on UI requirements
	}

	/**
	 * Convert ArrayBuffer to base64
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
	 * Show file picker menu
	 */
	showFilePickerMenu(event: MouseEvent): void {
		const files = this.app.vault.getMarkdownFiles();
		const menu = new Menu();

		files.slice(0, 20).forEach(file => {
			menu.addItem((item) => {
				item.setTitle(file.path)
					.setIcon('document')
					.onClick(() => this.attachFile(file));
			});
		});

		menu.showAtMouseEvent(event);
	}

	/**
	 * Show image picker menu
	 */
	showImagePickerMenu(event: MouseEvent): void {
		const imageFiles = this.app.vault.getFiles().filter(file => {
			const ext = file.extension.toLowerCase();
			return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
		});

		const menu = new Menu();

		imageFiles.slice(0, 20).forEach(file => {
			menu.addItem((item) => {
				item.setTitle(file.path)
					.setIcon('image')
					.onClick(() => this.attachImage(file));
			});
		});

		menu.showAtMouseEvent(event);
	}
}
