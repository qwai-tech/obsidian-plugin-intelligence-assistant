import { Modal, App } from 'obsidian';
import { t } from '@/i18n';
import { TestIds } from '@/presentation/utils/test-ids';

/**
 * Confirmation modal to replace window.confirm()
 */
export class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;
	private onCancel?: () => void;
	private resolved = false;

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

		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv('modal-button-container');

		const cancelBtn = buttonContainer.createEl('button', { text: t('modals.confirm.cancel') });
		cancelBtn.setAttribute('data-testid', TestIds.settings.confirmModalCancelBtn);
		cancelBtn.addEventListener('click', () => {
			this.resolved = true;
			this.close();
			this.onCancel?.();
		});

		const confirmBtn = buttonContainer.createEl('button', {
			text: t('modals.confirm.confirm'),
			cls: 'mod-warning'
		});
		confirmBtn.setAttribute('data-testid', TestIds.settings.confirmModalConfirmBtn);
		confirmBtn.addEventListener('click', () => {
			this.resolved = true;
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		// Resolve as cancelled if closed via Escape/X without a button click
		if (!this.resolved) {
			this.resolved = true;
			this.onCancel?.();
		}
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
