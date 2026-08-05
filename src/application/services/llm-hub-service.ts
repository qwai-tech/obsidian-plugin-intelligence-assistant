import {
	LLM_HUB_API_VERSION,
	ModelManager,
	ProviderFactory,
	type ILLMProvider,
	type LLMConfig,
	type LLMHub,
	type ModelInfo,
} from '@qwai/obsidian-llm';

/** The slice of plugin state the hub needs. Keeps this testable without a Plugin. */
export interface LLMHubHost {
	getLLMConfigs(): LLMConfig[];
	getDefaultModelId(): string | null;
}

/**
 * This plugin's implementation of the cross-plugin LLM hub.
 *
 * It exists so a user configures their providers and API keys once, here, and
 * every other plugin on the vault can use them -- rather than each plugin
 * shipping its own provider list and asking for the same keys again.
 *
 * The security shape is the whole point, so it is worth being explicit about what
 * this class does NOT do. Obsidian has no permission model: whatever is reachable
 * on the plugin instance is reachable by every enabled plugin, trusted or not. So
 * there is no `getConfig`, no `getApiKey`, and no method that returns an
 * `LLMConfig`. Callers get an `ILLMProvider` -- the ability to send a request --
 * and the credential stays inside this closure. A caller can spend the user's
 * quota, which is inherent in lending the capability at all, but it cannot read
 * the key or reuse it elsewhere.
 *
 * Do not add a method that returns configuration. That is the invariant.
 */
export class LLMHubService implements LLMHub {
	readonly apiVersion = LLM_HUB_API_VERSION;

	/**
	 * A genuinely private field, not a `private` one.
	 *
	 * TypeScript's `private` is erased at compile time: `constructor(private host)`
	 * leaves an ordinary enumerable property, so a hostile plugin holding this
	 * object could simply call `hub.host.getLLMConfigs()` and read every API key --
	 * defeating the entire point of handing out capability instead of credentials.
	 * A `#` field is enforced by the runtime (downlevelled to a WeakMap at this
	 * target), so it is unreachable from outside the class. Do not relax this.
	 */
	readonly #host: LLMHubHost;

	constructor(host: LLMHubHost) {
		this.#host = host;
	}

	async listModels(): Promise<ModelInfo[]> {
		const models = await ModelManager.getAllAvailableModels(this.#host.getLLMConfigs());
		return models.filter(model => model.enabled);
	}

	getProvider(modelId: string): Promise<ILLMProvider | null> {
		const config = ModelManager.findConfigForModelByProvider(modelId, this.#host.getLLMConfigs());
		if (!config) return Promise.resolve(null);
		// `config` -- credentials included -- stays local; only the provider escapes.
		return Promise.resolve(ProviderFactory.createProvider(config));
	}

	getDefaultModelId(): Promise<string | null> {
		return Promise.resolve(this.#host.getDefaultModelId());
	}
}
