import { Modal, App } from 'obsidian';

/**
 * Prompt modal to replace window.prompt()
 */
export class PromptModal extends Modal {
	private message: string;
	private defaultValue: string;
	private onSubmit: (value: string | null) => void;
	private inputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		message: string,
		defaultValue: string,
		onSubmit: (value: string | null) => void
	) {
		super(app);
		this.message = message;
		this.defaultValue = defaultValue;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-prompt-modal');

		// Message
		contentEl.createEl('p', { text: this.message });

		// Input field
		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			value: this.defaultValue
		});
		this.inputEl.addClass('ia-prompt-input');

		// Focus and select the input
		setTimeout(() => {
			this.inputEl?.focus();
			this.inputEl?.select();
		}, 10);

		// Handle Enter key
		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.cancel();
			}
		});

		// Buttons
		const buttonContainer = contentEl.createDiv('modal-button-container');

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.cancel();
		});

		const submitBtn = buttonContainer.createEl('button', {
			text: 'OK',
			cls: 'mod-cta'
		});
		submitBtn.addEventListener('click', () => {
			this.submit();
		});
	}

	private submit(): void {
		const value = this.inputEl?.value ?? null;
		this.close();
		this.onSubmit(value);
	}

	private cancel(): void {
		this.close();
		this.onSubmit(null);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Helper function to show prompt dialog
 */
export async function showPrompt(
	app: App,
	message: string,
	defaultValue = ''
): Promise<string | null> {
	return new Promise((resolve) => {
		new PromptModal(
			app,
			message,
			defaultValue,
			(value) => resolve(value)
		).open();
	});
}
