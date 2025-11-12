/**
 * Test suite for DI Container
 */

import { Container } from '../../core/container';

describe('Container', () => {
	let container: Container;

	beforeEach(() => {
		container = new Container();
	});

	describe('register and resolve', () => {
		it('should register and resolve a singleton service', () => {
			class TestService {
				value = Math.random();
			}

			container.registerSingleton('test', () => new TestService());

			const instance1 = container.resolve<TestService>('test');
			const instance2 = container.resolve<TestService>('test');

			expect(instance1).toBe(instance2);
			expect(instance1.value).toBe(instance2.value);
		});

		it('should register and resolve a transient service', () => {
			class TestService {
				value = Math.random();
			}

			container.registerTransient('test', () => new TestService());

			const instance1 = container.resolve<TestService>('test');
			const instance2 = container.resolve<TestService>('test');

			expect(instance1).not.toBe(instance2);
			expect(instance1.value).not.toBe(instance2.value);
		});

		it('should throw error when resolving unregistered service', () => {
			expect(() => {
				container.resolve('nonexistent');
			}).toThrow('Service not found: nonexistent');
		});
	});

	describe('async services', () => {
		it('should register and resolve async singleton service', async () => {
			class AsyncService {
				value = Math.random();
				async initialize() {
					await new Promise(resolve => setTimeout(resolve, 10));
				}
			}

			container.registerSingleton('async', async () => {
				const service = new AsyncService();
				await service.initialize();
				return service;
			});

			const instance1 = await container.resolveAsync<AsyncService>('async');
			const instance2 = await container.resolveAsync<AsyncService>('async');

			expect(instance1).toBe(instance2);
			expect(instance1.value).toBe(instance2.value);
		});

		it('should handle async errors', async () => {
			container.registerSingleton('failing', async () => {
				throw new Error('Initialization failed');
			});

			await expect(container.resolveAsync('failing')).rejects.toThrow(
				'Initialization failed'
			);
		});
	});

	describe('dependencies', () => {
		it('should resolve services with dependencies', () => {
			class DatabaseService {
				connected = true;
			}

			class UserService {
				constructor(public db: DatabaseService) {}
			}

			container.registerSingleton('database', () => new DatabaseService());
			container.registerSingleton('user', () => {
				const db = container.resolve<DatabaseService>('database');
				return new UserService(db);
			});

			const userService = container.resolve<UserService>('user');
			expect(userService.db.connected).toBe(true);
		});
	});

	describe('has and clear', () => {
		it('should check if service is registered', () => {
			container.registerSingleton('test', () => ({}));

			expect(container.has('test')).toBe(true);
			expect(container.has('nonexistent')).toBe(false);
		});

		it('should clear specific service', () => {
			container.registerSingleton('test', () => ({}));
			expect(container.has('test')).toBe(true);

			container.unregister('test');
			expect(container.has('test')).toBe(false);
		});

		it('should clear all services', () => {
			container.registerSingleton('test1', () => ({}));
			container.registerSingleton('test2', () => ({}));

			expect(container.has('test1')).toBe(true);
			expect(container.has('test2')).toBe(true);

			container.clear();

			expect(container.has('test1')).toBe(false);
			expect(container.has('test2')).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle circular dependencies gracefully', () => {
			container.registerSingleton('a', () => {
				const b = container.resolve('b');
				return { b };
			});

			container.registerSingleton('b', () => {
				const a = container.resolve('a');
				return { a };
			});

			// This should throw due to circular dependency
			expect(() => {
				container.resolve('a');
			}).toThrow();
		});

		it('should allow re-registration of services', () => {
			container.registerSingleton('test', () => ({ value: 1 }));
			const first = container.resolve<{ value: number }>('test');

			container.unregister('test');
			container.registerSingleton('test', () => ({ value: 2 }));
			const second = container.resolve<{ value: number }>('test');

			expect(first.value).toBe(1);
			expect(second.value).toBe(2);
		});
	});
});
