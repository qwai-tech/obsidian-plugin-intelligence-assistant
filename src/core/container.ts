// Dependency injection container
export class DIContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private singletonFactories = new Map<string, () => any>();

  register<T>(key: string, factory: () => T, singleton: boolean = true): void {
    if (singleton) {
      this.singletonFactories.set(key, factory);
    } else {
      this.factories.set(key, factory);
    }
  }

  get<T>(key: string): T {
    // Check if it's already instantiated as a singleton
    if (this.services.has(key)) {
      return this.services.get(key);
    }

    // Check if it's a singleton factory
    const singletonFactory = this.singletonFactories.get(key);
    if (singletonFactory) {
      const instance = singletonFactory();
      this.services.set(key, instance);
      return instance;
    }

    // Check if it's a transient factory
    const factory = this.factories.get(key);
    if (factory) {
      return factory();
    }

    throw new Error(`Service ${key} not registered`);
  }

  has(key: string): boolean {
    return this.services.has(key) || this.singletonFactories.has(key) || this.factories.has(key);
  }

  clear(key?: string): void {
    if (key) {
      this.services.delete(key);
      this.singletonFactories.delete(key);
      this.factories.delete(key);
    } else {
      this.services.clear();
      this.singletonFactories.clear();
      this.factories.clear();
    }
  }

  async getAsync<T>(key: string): Promise<T> {
    return Promise.resolve(this.get<T>(key));
  }

  registerAsync<T>(key: string, factory: () => Promise<T>): void {
    this.singletonFactories.set(key, () => {
      throw new Error('Async factories must be resolved with getAsync');
    });
    // Store separately for async resolution
    (this as any).asyncFactories = (this as any).asyncFactories || new Map();
    (this as any).asyncFactories.set(key, factory);
  }
}

// Global container instance
export const container = new DIContainer();