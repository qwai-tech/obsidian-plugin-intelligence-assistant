import { App, Modal, Setting } from 'obsidian';
import { t } from '@/i18n';

export class TextInputModal extends Modal {
	result: string;
	onSubmit: (result: string) => void;
	placeholder: string;
	defaultValue: string;
	title: string;

	constructor(app: App, title: string, placeholder: string, defaultValue: string, onSubmit: (result: string) => void) {
		super(app);
		this.title = title;
		this.placeholder = placeholder;
		this.defaultValue = defaultValue;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: this.title });

		new Setting(contentEl)
			.setName(t('modals.textInput.nameLabel'))
			.addText(text => {
				text.setPlaceholder(this.placeholder)
					.setValue(this.defaultValue)
					.onChange(value => {
						this.result = value;
					});
				text.inputEl.focus();
				text.inputEl.select();
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.close();
						this.onSubmit(this.result || this.defaultValue);
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(t('modals.textInput.create'))
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.result || this.defaultValue);
				}))
			.addButton(btn => btn
				.setButtonText(t('modals.textInput.cancel'))
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
