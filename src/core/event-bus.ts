// Event bus system
export type EventListener = (data: any) => void;

export class EventBus {
  private listeners = new Map<string, EventListener[]>();
  private onceListeners = new Map<string, EventListener[]>();

  on(event: string, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    
    return () => this.off(event, listener);
  }

  once(event: string, listener: EventListener): void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, []);
    }
    this.onceListeners.get(event)!.push(listener);
  }

  emit(event: string, data: any): void {
    // Emit to regular listeners
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      [...eventListeners].forEach(listener => listener(data));
    }

    // Emit to once listeners and then remove them
    const onceEventListeners = this.onceListeners.get(event);
    if (onceEventListeners) {
      [...onceEventListeners].forEach(listener => listener(data));
      this.onceListeners.delete(event);
    }
  }

  emitSync(event: string, data: any): void {
    this.emit(event, data);
  }

  off(event: string, listener: EventListener): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }

    const onceEventListeners = this.onceListeners.get(event);
    if (onceEventListeners) {
      const index = onceEventListeners.indexOf(listener);
      if (index > -1) {
        onceEventListeners.splice(index, 1);
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  listenerCount(event: string): number {
    const listeners = this.listeners.get(event) || [];
    const onceListeners = this.onceListeners.get(event) || [];
    return listeners.length + onceListeners.length;
  }

  events(): string[] {
    return Array.from(new Set([
      ...this.listeners.keys(),
      ...this.onceListeners.keys()
    ]));
  }
}

// Global instance
export const eventBus = new EventBus();

// Re-export PluginEvent
export { PluginEvent } from './types/event.types';