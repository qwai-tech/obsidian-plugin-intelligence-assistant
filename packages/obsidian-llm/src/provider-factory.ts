import { providerFacade } from './provider-facade';
import { ILLMProvider } from './types';
import type { LLMConfig } from './types';
import { type HttpPort, getDefaultHttpPort } from './http';
import { providerDefinition } from './provider-definitions';

export class ProviderFactory {
	/**
	 * @param config Endpoint and credentials for the provider.
	 * @param http Transport to use. Defaults to the port registered via
	 *   `setDefaultHttpPort`, which is what production call sites rely on; pass one
	 *   explicitly in tests to keep them off the network.
	 */
	static createProvider(config: LLMConfig, http: HttpPort = getDefaultHttpPort()): ILLMProvider {
		// Snapshot the connection for this provider's lifetime.
		const snapshot = JSON.parse(JSON.stringify(config)) as LLMConfig;
		return providerFacade(this.createRawProvider(snapshot, http), { provider: snapshot.provider, id: snapshot.id });
	}
	private static createRawProvider(config: LLMConfig, http: HttpPort): ILLMProvider {
		return providerDefinition(config.provider).create(config, http);
	}
}
