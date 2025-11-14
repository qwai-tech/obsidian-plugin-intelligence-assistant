// Service registry
import type { IService } from './interfaces/service.interface';

export class ServiceRegistry {
  private services = new Map<string, IService>();

  register(name: string, service: IService): void {
    this.services.set(name, service);
  }

  get<T extends IService>(name: string): T | undefined {
    return this.services.get(name) as T;
  }

  async initializeAll(config?: unknown): Promise<void> {
    for (const [name, service] of this.services) {
      try {
        await service.initialize(config);
        console.debug(`Service ${name} initialized successfully`);
      } catch (error) {
        console.error(`Failed to initialize service ${name}:`, error);
      }
    }
  }

  async cleanupAll(): Promise<void> {
    for (const [name, service] of this.services) {
      try {
        await service.cleanup();
        console.debug(`Service ${name} cleaned up successfully`);
      } catch (error) {
        console.error(`Failed to cleanup service ${name}:`, error);
      }
    }
  }
}

// Global instance
export const serviceRegistry = new ServiceRegistry();