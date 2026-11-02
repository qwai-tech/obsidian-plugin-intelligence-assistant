import { App, ButtonComponent, Modal } from 'obsidian';
import { t } from '@/i18n';

export interface WelcomeActions {
	openSettings: () => void;
	openChat: () => Promise<void>;
}

export class WelcomeModal extends Modal {
	constructor(app: App, private readonly actions: WelcomeActions) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-welcome-modal');
		this.setTitle(t('modals.welcome.title'));

		contentEl.createEl('p', { text: t('modals.welcome.intro') });
		const steps = contentEl.createEl('ol', { cls: 'ia-welcome-steps' });
		for (const step of ['addProvider', 'testConnection', 'startChat']) {
			steps.createEl('li', { text: t(`modals.welcome.steps.${step}`) });
		}

		const footer = contentEl.createDiv('ia-modal-footer');
		new ButtonComponent(footer)
			.setButtonText(t('modals.welcome.openSettings'))
			.setCta()
			.onClick(() => {
				this.close();
				this.actions.openSettings();
			});
		new ButtonComponent(footer)
			.setButtonText(t('modals.welcome.openChat'))
			.onClick(() => {
				this.close();
				void this.actions.openChat();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
