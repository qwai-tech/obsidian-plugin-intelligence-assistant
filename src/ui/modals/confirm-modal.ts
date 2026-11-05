import { Modal, App } from 'obsidian';
import { t } from '@/i18n';
import { TestIds } from '@/ui/utils/test-ids';

export interface ConfirmationOptions {
	title: string;
	confirmText?: string;
	destructive?: boolean;
}

/**
 * Confirmation modal to replace window.confirm()
 */
class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;
	private onCancel?: () => void;
	private resolved = false;

	constructor(
		app: App,
		message: string,
		onConfirm: () => void,
		onCancel?: () => void,
		private readonly options?: ConfirmationOptions,
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
		this.setTitle(this.options?.title ?? t('modals.confirm.confirm'));

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
			text: this.options?.confirmText ?? t('modals.confirm.confirm'),
			cls: this.options?.destructive === false ? 'mod-cta' : 'mod-warning'
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
	message: string,
	options?: ConfirmationOptions,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(
			app,
			message,
			() => resolve(true),
			() => resolve(false),
			options,
		).open();
	});
}
