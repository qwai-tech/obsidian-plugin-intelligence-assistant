import { App, Modal, Setting } from 'obsidian';
import { dismissNotifications, recentNotifications } from '@/core/notifications';
import { t } from '@/i18n';

export class NotificationHistoryModal extends Modal {
	constructor(app: App) { super(app); }
	onOpen(): void {
		this.setTitle(t('ux.notificationsTitle'));
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: t('ux.notificationsDesc'), cls: 'setting-item-description' });
		new Setting(contentEl).addButton(button => button.setButtonText(t('ux.dismissNotifications')).onClick(dismissNotifications));
		const entries = recentNotifications();
		if (!entries.length) contentEl.createEl('p', { text: t('ux.notificationsEmpty') });
		const list = contentEl.createEl('ol', { cls: 'ia-notification-history' });
		for (const entry of entries) {
			const row = list.createEl('li');
			row.createEl('p', { text: entry.message });
			row.createEl('small', { text: `${new Date(entry.timestamp).toLocaleString()}${entry.count > 1 ? ` · ×${entry.count}` : ''}` });
		}
	}
	onClose(): void { this.contentEl.empty(); }
}
