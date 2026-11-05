import { App, Modal, Setting } from 'obsidian';
import { t } from '@/i18n';

export function reviewReplacement(app: App, title: string, original: string, proposed: string): Promise<boolean> {
	return new Promise(resolve => {
		class ReplacementPreview extends Modal {
			private accepted = false;
			onOpen(): void {
				this.setTitle(title);
				this.contentEl.addClass('ia-replacement-preview');
				for (const [label, text] of [[t('ux.original'), original], [t('ux.proposed'), proposed]]) {
					new Setting(this.contentEl).setName(label).setHeading();
					this.contentEl.createEl('pre', { text });
				}
				const footer = this.contentEl.createDiv('ia-modal-footer');
				footer.createEl('button', { text: t('modals.confirm.cancel') }).addEventListener('click', () => this.close());
				footer.createEl('button', { text: t('ux.replaceSelection'), cls: 'mod-cta' }).addEventListener('click', () => {
					this.accepted = true;
					this.close();
				});
			}
			onClose(): void { this.contentEl.empty(); resolve(this.accepted); }
		}
		new ReplacementPreview(app).open();
	});
}
