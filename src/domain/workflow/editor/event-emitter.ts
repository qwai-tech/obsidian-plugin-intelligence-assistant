/**
 * Workflow System V2 - Event Emitter
 *
 * Simple event emitter for the editor system.
 */

export class EventEmitter<Events extends Record<string, any>> {
	private listeners = new Map<keyof Events, Set<Function>>();

	/**
	 * Add event listener
	 */
	on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(handler);
	}

	/**
	 * Remove event listener
	 */
	off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
		const handlers = this.listeners.get(event);
		if (handlers) {
			handlers.delete(handler);
		}
	}

	/**
	 * Emit event
	 */
	emit<K extends keyof Events>(event: K, data: Events[K]): void {
		const handlers = this.listeners.get(event);
		if (handlers) {
			handlers.forEach(handler => {
				try {
					handler(data);
				} catch (error) {
					console.error(`Error in event handler for ${String(event)}:`, error);
				}
			});
		}
	}

	/**
	 * Add one-time event listener
	 */
	once<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
		const onceHandler = (data: Events[K]) => {
			handler(data);
			this.off(event, onceHandler);
		};
		this.on(event, onceHandler);
	}

	/**
	 * Clear all listeners
	 */
	clear(): void {
		this.listeners.clear();
	}

	/**
	 * Clear listeners for specific event
	 */
	clearEvent<K extends keyof Events>(event: K): void {
		this.listeners.delete(event);
	}
}
