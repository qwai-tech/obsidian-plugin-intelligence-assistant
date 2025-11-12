/**
 * Test suite for Event Bus
 */

import { EventBus, PluginEvent } from '../../core/event-bus';

describe('EventBus', () => {
	let eventBus: EventBus;

	beforeEach(() => {
		eventBus = new EventBus();
	});

	afterEach(() => {
		eventBus.removeAllListeners();
	});

	describe('on and emit', () => {
		it('should register and emit events', async () => {
			const handler = jest.fn();
			eventBus.on(PluginEvent.MESSAGE_SENT, handler);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, { content: 'test' });

			expect(handler).toHaveBeenCalledWith({ content: 'test' });
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it('should support multiple handlers for same event', async () => {
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			eventBus.on(PluginEvent.MESSAGE_SENT, handler1);
			eventBus.on(PluginEvent.MESSAGE_SENT, handler2);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, { content: 'test' });

			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it('should handle async handlers', async () => {
			const results: number[] = [];
			const asyncHandler = async (data: any) => {
				await new Promise(resolve => setTimeout(resolve, 10));
				results.push(data.value);
			};

			eventBus.on(PluginEvent.MESSAGE_SENT, asyncHandler);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, { value: 1 });
			await eventBus.emit(PluginEvent.MESSAGE_SENT, { value: 2 });

			expect(results).toEqual([1, 2]);
		});
	});

	describe('once', () => {
		it('should register handler that runs only once', async () => {
			const handler = jest.fn();
			eventBus.once(PluginEvent.MESSAGE_SENT, handler);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, { content: 'first' });
			await eventBus.emit(PluginEvent.MESSAGE_SENT, { content: 'second' });

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith({ content: 'first' });
		});

		it('should support async once handlers', async () => {
			const handler = jest.fn(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			eventBus.once(PluginEvent.MESSAGE_SENT, handler);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});
			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe('off', () => {
		it('should remove specific handler', async () => {
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			eventBus.on(PluginEvent.MESSAGE_SENT, handler1);
			eventBus.on(PluginEvent.MESSAGE_SENT, handler2);

			eventBus.off(PluginEvent.MESSAGE_SENT, handler1);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it('should remove once handlers', async () => {
			const handler = jest.fn();
			eventBus.once(PluginEvent.MESSAGE_SENT, handler);
			eventBus.off(PluginEvent.MESSAGE_SENT, handler);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe('emitSync', () => {
		it('should emit events without waiting', () => {
			const handler = jest.fn();
			eventBus.on(PluginEvent.MESSAGE_SENT, handler);

			eventBus.emitSync(PluginEvent.MESSAGE_SENT, { content: 'test' });

			// Handler may not have been called yet, but it should be called soon
			// We can't assert immediately, but we can verify it was queued
			expect(handler).toHaveBeenCalled();
		});
	});

	describe('removeAllListeners', () => {
		it('should remove all listeners for specific event', async () => {
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			eventBus.on(PluginEvent.MESSAGE_SENT, handler1);
			eventBus.on(PluginEvent.MESSAGE_RECEIVED, handler2);

			eventBus.removeAllListeners(PluginEvent.MESSAGE_SENT);

			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});
			await eventBus.emit(PluginEvent.MESSAGE_RECEIVED, {});

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it('should remove all listeners for all events', async () => {
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			eventBus.on(PluginEvent.MESSAGE_SENT, handler1);
			eventBus.on(PluginEvent.MESSAGE_RECEIVED, handler2);

			eventBus.removeAllListeners();

			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});
			await eventBus.emit(PluginEvent.MESSAGE_RECEIVED, {});

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).not.toHaveBeenCalled();
		});
	});

	describe('listenerCount', () => {
		it('should return correct listener count', () => {
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			expect(eventBus.listenerCount(PluginEvent.MESSAGE_SENT)).toBe(0);

			eventBus.on(PluginEvent.MESSAGE_SENT, handler1);
			expect(eventBus.listenerCount(PluginEvent.MESSAGE_SENT)).toBe(1);

			eventBus.on(PluginEvent.MESSAGE_SENT, handler2);
			expect(eventBus.listenerCount(PluginEvent.MESSAGE_SENT)).toBe(2);

			eventBus.once(PluginEvent.MESSAGE_SENT, jest.fn());
			expect(eventBus.listenerCount(PluginEvent.MESSAGE_SENT)).toBe(3);
		});
	});

	describe('events', () => {
		it('should return all registered events', () => {
			eventBus.on(PluginEvent.MESSAGE_SENT, jest.fn());
			eventBus.on(PluginEvent.MESSAGE_RECEIVED, jest.fn());
			eventBus.once(PluginEvent.AGENT_CHANGED, jest.fn());

			const events = eventBus.events();

			expect(events).toContain(PluginEvent.MESSAGE_SENT);
			expect(events).toContain(PluginEvent.MESSAGE_RECEIVED);
			expect(events).toContain(PluginEvent.AGENT_CHANGED);
			expect(events.length).toBe(3);
		});
	});

	describe('error handling', () => {
		it('should handle errors in handlers gracefully', async () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
			const goodHandler = jest.fn();
			const badHandler = jest.fn(() => {
				throw new Error('Handler error');
			});

			eventBus.on(PluginEvent.MESSAGE_SENT, badHandler);
			eventBus.on(PluginEvent.MESSAGE_SENT, goodHandler);

			// Should not throw - errors are caught internally
			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});

			expect(badHandler).toHaveBeenCalled();
			expect(goodHandler).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should handle errors in async handlers', async () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
			const goodHandler = jest.fn();
			const badHandler = jest.fn(async () => {
				throw new Error('Async handler error');
			});

			eventBus.on(PluginEvent.MESSAGE_SENT, badHandler);
			eventBus.on(PluginEvent.MESSAGE_SENT, goodHandler);

			// Should not throw - errors are caught internally
			await eventBus.emit(PluginEvent.MESSAGE_SENT, {});

			expect(badHandler).toHaveBeenCalled();
			expect(goodHandler).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});
});
