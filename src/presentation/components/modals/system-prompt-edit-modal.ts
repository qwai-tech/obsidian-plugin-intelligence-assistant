import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import type { SystemPrompt } from '@/types';
import { t } from '@/i18n';
import { TestIds } from '@/presentation/utils/test-ids';

export class SystemPromptEditModal extends Modal {
	private prompt: SystemPrompt;
	private onSaveCallback: (prompt: SystemPrompt) => void | Promise<void>;

	constructor(app: App, prompt: SystemPrompt, onSave: (prompt: SystemPrompt) => void | Promise<void>) {
		super(app);
		this.prompt = JSON.parse(JSON.stringify(prompt)) as SystemPrompt; // Deep copy
		this.onSaveCallback = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: t('modals.promptEdit.title') });

		new Setting(contentEl)
			.setName(t('modals.promptEdit.name.name'))
			.setDesc(t('modals.promptEdit.name.desc'))
			.addText(text => {
				text.inputEl.setAttribute('data-testid', TestIds.settings.promptModalNameInput);
				text.setValue(this.prompt.name).onChange(value => {
					this.prompt.name = value;
				});
			});

		new Setting(contentEl)
			.setName(t('modals.promptEdit.content.name'))
			.setDesc(t('modals.promptEdit.content.desc'))
			.addTextArea(text => {
				text.setValue(this.prompt.content);
				text.inputEl.rows = 15;
				text.inputEl.addClass('ia-textarea--code');
				text.inputEl.setAttribute('data-testid', TestIds.settings.promptModalContentInput);
				text.onChange(value => {
					this.prompt.content = value;
				});
			});

		new Setting(contentEl)
			.setName(t('modals.promptEdit.enabled.name'))
			.setDesc(t('modals.promptEdit.enabled.desc'))
			.addToggle(toggle => {
				toggle.toggleEl.setAttribute('data-testid', TestIds.settings.promptModalEnabledToggle);
				toggle.setValue(this.prompt.enabled).onChange(value => {
					this.prompt.enabled = value;
				});
			});

		const buttonContainer = contentEl.createDiv('ia-modal-footer');
		buttonContainer.removeClass('ia-hidden');

		new ButtonComponent(buttonContainer)
			.setButtonText(t('modals.promptEdit.cancel'))
			.onClick(() => {
				this.close();
			})
			.buttonEl.setAttribute('data-testid', TestIds.settings.promptModalCancelBtn);

		new ButtonComponent(buttonContainer)
			.setButtonText(t('modals.promptEdit.save'))
			.setCta()
			.onClick(async () => {
				this.prompt.updatedAt = Date.now();
				await this.onSaveCallback(this.prompt);
				this.close();
			})
			.buttonEl.setAttribute('data-testid', TestIds.settings.promptModalSaveBtn);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
