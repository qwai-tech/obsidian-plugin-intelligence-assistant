import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import type { SystemPrompt } from '@/types';

export class SystemPromptEditModal extends Modal {
	private prompt: SystemPrompt;
	private onSaveCallback: (prompt: SystemPrompt) => void | Promise<void>;

	constructor(app: App, prompt: SystemPrompt, onSave: (prompt: SystemPrompt) => void | Promise<void>) {
		super(app);
		this.prompt = JSON.parse(JSON.stringify(prompt)); // Deep copy
		this.onSaveCallback = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Edit System Prompt' });

		// Name field
		new Setting(contentEl)
			.setName('Name')
			.setDesc('Display name for this prompt')
			.addText(text => text
				.setValue(this.prompt.name)
				.onChange(value => {
					this.prompt.name = value;
				}));

		// Content text area
		new Setting(contentEl)
			.setName('Content')
			.setDesc('The system prompt content')
			.addTextArea(text => {
				text.setValue(this.prompt.content);
				text.inputEl.rows = 15;
				text.inputEl.setCssProps({ 'width': '100%' });
				text.inputEl.setCssProps({ 'font-family': 'var(--font-monospace)' });
				text.inputEl.setCssProps({ 'font-size': '12px' });
				text.onChange(value => {
					this.prompt.content = value;
				});
			});

		// Enabled toggle
		new Setting(contentEl)
			.setName('Enabled')
			.setDesc('Whether this prompt is active')
			.addToggle(toggle => toggle
				.setValue(this.prompt.enabled)
				.onChange(value => {
					this.prompt.enabled = value;
				}));

		// Buttons
		const buttonContainer = contentEl.createDiv();
		buttonContainer.removeClass('ia-hidden');
		buttonContainer.setCssProps({ 'justify-content': 'flex-end' });
		buttonContainer.setCssProps({ 'gap': '8px' });
		buttonContainer.setCssProps({ 'margin-top': '16px' });

		new ButtonComponent(buttonContainer)
			.setButtonText('Cancel')
			.onClick(() => {
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('Save')
			.setCta()
			.onClick(async () => {
				this.prompt.updatedAt = Date.now();
				await this.onSaveCallback(this.prompt);
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
