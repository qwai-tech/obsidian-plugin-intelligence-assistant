export interface NotificationEntry { message: string; timestamp: number; count: number }
export interface NotificationHandle {
	setMessage(message: string | DocumentFragment): NotificationHandle;
	hide(): void;
}
export interface NotificationSink {
	notify(message: string | DocumentFragment, duration?: number, group?: string): NotificationHandle;
	recent(): readonly NotificationEntry[];
	dismiss(): void;
	dispose(): void;
}
let sink: NotificationSink | undefined;

/** The composition root supplies the real host implementation before UI startup. */
export function installNotificationSink(next: NotificationSink): () => void {
	sink = next;
	return () => { next.dispose(); if (sink === next) sink = undefined; };
}
export function notify(message: string | DocumentFragment, duration?: number, group?: string): NotificationHandle {
	if (!sink) throw new Error('Notification service is not initialized');
	return sink.notify(message, duration, group);
}
export function recentNotifications(): readonly NotificationEntry[] { return sink?.recent() ?? []; }
export function dismissNotifications(): void { sink?.dismiss(); }
