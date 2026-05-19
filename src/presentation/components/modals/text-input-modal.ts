import { App, Modal, Setting } from 'obsidian';

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
			.setName('Name')
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
				.setButtonText('Create')
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.result || this.defaultValue);
				}))
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
