// Provider factory interface
import type { ILLMProvider, LLMProviderConfig } from './base-provider.interface';

export interface ILLMProviderFactory {
  readonly name: string;
  create(_config: LLMProviderConfig): ILLMProvider;
}

// Provider registry system
export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private factories = new Map<string, ILLMProviderFactory>();
  private providers = new Map<string, ILLMProvider>();

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  register(factory: ILLMProviderFactory): void {
    this.factories.set(factory.name, factory);
  }

  createProvider(name: string, config: LLMProviderConfig): ILLMProvider | undefined {
    const factory = this.factories.get(name);
    return factory?.create(config);
  }

  async initializeProvider(name: string, config: LLMProviderConfig): Promise<ILLMProvider | undefined> {
    const provider = this.createProvider(name, config);
    if (provider) {
      await provider.initialize(config);
      this.providers.set(name, provider);
      return provider;
    }
    return undefined;
  }

  getProvider(name: string): ILLMProvider | undefined {
    return this.providers.get(name);
  }
}

// Global instance
export const providerRegistry = ProviderRegistry.getInstance();