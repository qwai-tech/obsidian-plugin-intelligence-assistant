// Dependency injection container
export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();
  private singletonFactories = new Map<string, () => unknown>();
  private asyncFactories = new Map<string, () => Promise<unknown>>();
  private resolving = new Set<string>();

  register<T>(key: string, factory: () => T, singleton: boolean = true): void {
    if (singleton) {
      this.singletonFactories.set(key, factory);
    } else {
      this.factories.set(key, factory);
    }
  }

  registerSingleton<T>(key: string, factory: () => T | Promise<T>): void {
    this.register(key, factory, true);
  }

  registerTransient<T>(key: string, factory: () => T): void {
    this.register(key, factory, false);
  }

  get<T>(key: string): T {
    if (this.resolving.has(key)) {
      throw new Error(`Circular dependency detected while resolving ${key}`);
    }

    // Check if it's already instantiated as a singleton
    if (this.services.has(key)) {
      return this.services.get(key) as T;
    }

    if (this.asyncFactories.has(key)) {
      throw new Error(`Async service ${key} must be resolved with getAsync`);
    }

    // Check if it's a singleton factory
    const singletonFactory = this.singletonFactories.get(key);
    if (singletonFactory) {
      try {
        this.resolving.add(key);
        const instance = singletonFactory();
        this.services.set(key, instance);
        return instance as T;
      } finally {
        this.resolving.delete(key);
      }
    }

    // Check if it's a transient factory
    const factory = this.factories.get(key);
    if (factory) {
      try {
        this.resolving.add(key);
        return factory() as T;
      } finally {
        this.resolving.delete(key);
      }
    }

    throw new Error(`Service not found: ${key}`);
  }

  resolve<T>(key: string): T {
    return this.get<T>(key);
  }

  has(key: string): boolean {
    return this.services.has(key) || this.singletonFactories.has(key) || this.factories.has(key);
  }

  clear(key?: string): void {
    if (key) {
      this.services.delete(key);
      this.singletonFactories.delete(key);
      this.factories.delete(key);
      this.asyncFactories.delete(key);
    } else {
      this.services.clear();
      this.singletonFactories.clear();
      this.factories.clear();
      this.asyncFactories.clear();
    }
  }

  unregister(key: string): void {
    this.clear(key);
  }

  async getAsync<T>(key: string): Promise<T> {
    if (this.resolving.has(key)) {
      throw new Error(`Circular dependency detected while resolving ${key}`);
    }

    if (this.services.has(key)) {
      return this.services.get(key) as T;
    }

    const asyncFactory = this.asyncFactories.get(key);
    if (asyncFactory) {
      try {
        this.resolving.add(key);
        const instance = await asyncFactory();
        this.services.set(key, instance);
        return instance as T;
      } finally {
        this.resolving.delete(key);
      }
    }

    const singletonFactory = this.singletonFactories.get(key);
    if (singletonFactory) {
      try {
        this.resolving.add(key);
        const instance = await singletonFactory();
        this.services.set(key, instance);
        return instance as T;
      } finally {
        this.resolving.delete(key);
      }
    }

    const factory = this.factories.get(key);
    if (factory) {
      try {
        this.resolving.add(key);
        return await factory() as T;
      } finally {
        this.resolving.delete(key);
      }
    }

    throw new Error(`Service not found: ${key}`);
  }

  resolveAsync<T>(key: string): Promise<T> {
    return this.getAsync<T>(key);
  }

  registerAsync<T>(key: string, factory: () => Promise<T>): void {
    this.asyncFactories.set(key, factory);
  }
}

export { DIContainer as Container };

// Global container instance
export const container = new DIContainer();
