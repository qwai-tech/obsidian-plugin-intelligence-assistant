import { Notice } from 'obsidian';

import type { NotificationEntry, NotificationHandle, NotificationSink } from '@/core/notifications';

interface ActiveNotification {
	key: string;
	notice: Notice;
	entry: NotificationEntry;
	timer?: number;
	handle: NotificationHandle;
}
const MAX_VISIBLE = 3;
const MAX_HISTORY = 50;
const active: ActiveNotification[] = [];
const history: NotificationEntry[] = [];
const text = (message: string | DocumentFragment) => typeof message === 'string' ? message : message.textContent ?? '';

export function recentNotifications(): readonly NotificationEntry[] {
	return history.map(entry => ({ ...entry })).sort((a, b) => b.timestamp - a.timestamp);
}

export function dismissNotifications(): void {
	for (const item of [...active]) item.handle.hide();
}

export function disposeNotifications(): void {
	dismissNotifications();
	history.length = 0;
}

/** Plugin-owned notices only: coalesce duplicates and bound the visible stack. */
export function notify(message: string | DocumentFragment, duration = 5000, group?: string): NotificationHandle {
	for (const item of [...active]) {
		if (!item.notice.containerEl.isConnected) item.handle.hide();
	}
	const messageText = text(message);
	// Persistent progress handles must not accidentally share ownership.
	const key = group ?? (duration === 0 ? crypto.randomUUID() : messageText);
	const existing = active.find(item => item.key === key);
	const expire = (item: ActiveNotification) => {
		if (item.timer) window.clearTimeout(item.timer);
		if (duration > 0) item.timer = window.setTimeout(() => item.handle.hide(), duration);
	};
	if (existing) {
		if (existing.entry.message === messageText) existing.entry.count++;
		else existing.entry.count = 1;
		existing.handle.setMessage(message);
		expire(existing);
		return existing.handle;
	}
	while (active.length >= MAX_VISIBLE) active[0].handle.hide();
	const entry: NotificationEntry = { message: messageText, timestamp: Date.now(), count: 1 };
	history.push(entry);
	if (history.length > MAX_HISTORY) history.shift();
	const notice = new Notice(message, 0);
	notice.containerEl.addClass('ia-plugin-notice');
	const item: ActiveNotification = {
		key, notice, entry,
		handle: {
			setMessage(next) {
				entry.message = text(next);
				entry.timestamp = Date.now();
				notice.setMessage(entry.count > 1 ? `${entry.message} (×${entry.count})` : next);
				return item.handle;
			},
			hide() {
				if (item.timer) window.clearTimeout(item.timer);
				// Avoid overlap with the next toast during the host's fade-out animation.
				notice.containerEl.hidden = true;
				notice.hide();
				const index = active.indexOf(item);
				if (index >= 0) active.splice(index, 1);
			},
		},
	};
	active.push(item);
	expire(item);
	return item.handle;
}

export const obsidianNotificationSink: NotificationSink = { notify, recent: recentNotifications, dismiss: dismissNotifications, dispose: disposeNotifications };
