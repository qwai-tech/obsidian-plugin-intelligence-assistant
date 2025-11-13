import { Modal, App } from 'obsidian';

/**
 * Confirmation modal to replace window.confirm()
 */
export class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;
	private onCancel?: () => void;

	constructor(
		app: App,
		message: string,
		onConfirm: () => void,
		onCancel?: () => void
	) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-confirm-modal');

		// Message
		contentEl.createEl('p', { text: this.message });

		// Buttons
		const buttonContainer = contentEl.createDiv('modal-button-container');

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.close();
			if (this.onCancel) {
				this.onCancel();
			}
		});

		const confirmBtn = buttonContainer.createEl('button', {
			text: 'Confirm',
			cls: 'mod-warning'
		});
		confirmBtn.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Helper function to show confirmation dialog
 */
export async function showConfirm(
	app: App,
	message: string
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(
			app,
			message,
			() => resolve(true),
			() => resolve(false)
		).open();
	});
}
