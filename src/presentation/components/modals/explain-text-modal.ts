import { Modal, App, MarkdownRenderer, Component } from 'obsidian';

/**
 * Modal to display text explanation results with markdown rendering
 */
export class ExplainTextModal extends Modal {
	private title: string;
	private content: string;
	private isLoading: boolean;
	private markdownComponent: Component;

	constructor(app: App, title: string, content?: string) {
		super(app);
		this.title = title;
		this.content = content || '';
		this.isLoading = !content;
		this.markdownComponent = new Component();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('explain-text-modal');

		// Load the markdown component
		this.markdownComponent.load();

		// Header
		const header = contentEl.createDiv('explain-text-modal-header');
		header.createSpan({ text: '💡', cls: 'explain-text-modal-icon' });
		header.createSpan({ text: this.title, cls: 'explain-text-modal-title' });

		// Content container
		const contentContainer = contentEl.createDiv('explain-text-modal-content');

		if (this.isLoading) {
			this.renderLoading(contentContainer);
		} else {
			// Render content asynchronously
			this.renderContent(contentContainer).catch(error => {
				console.error('[ExplainTextModal] Error rendering content:', error);
				contentContainer.empty();
				const errorDiv = contentContainer.createDiv('explain-text-modal-error');
				errorDiv.setText('Error rendering explanation');
			});
		}
	}

	private renderLoading(container: HTMLElement): void {
		const loadingDiv = container.createDiv('explain-text-modal-loading');
		loadingDiv.createSpan({ text: '⏳ Processing...' });
	}

	private async renderContent(container: HTMLElement): Promise<void> {
		const contentDiv = container.createDiv('explain-text-modal-text');

		// Add class for styling
		contentDiv.addClass('explain-text-modal-text-content');

		// Render markdown using Obsidian's MarkdownRenderer
		await MarkdownRenderer.render(
			this.app,
			this.content,
			contentDiv,
			'', // sourcePath - empty since this is not from a file
			this.markdownComponent
		);
	}

	/**
	 * Update the modal content (used when loading completes or streaming updates)
	 */
	updateContent(content: string): void {
		this.content = content;
		this.isLoading = false;

		const { contentEl } = this;
		const contentContainer = contentEl.querySelector('.explain-text-modal-content');
		if (contentContainer) {
			contentContainer.empty();
			// Render content asynchronously
			this.renderContent(contentContainer as HTMLElement).catch(error => {
				console.error('[ExplainTextModal] Error rendering content:', error);
				contentContainer.empty();
				const errorDiv = contentContainer.createDiv('explain-text-modal-error');
				errorDiv.setText('Error rendering explanation');
			});
		}
	}

	/**
	 * Show an error in the modal
	 */
	showError(error: string): void {
		const { contentEl } = this;
		const contentContainer = contentEl.querySelector('.explain-text-modal-content');
		if (contentContainer) {
			contentContainer.empty();
			const errorDiv = contentContainer.createDiv('explain-text-modal-error');
			errorDiv.createSpan({ text: '❌ Error: ' });
			errorDiv.createSpan({ text: error });
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		// Unload the markdown component to clean up
		this.markdownComponent.unload();
	}
}
