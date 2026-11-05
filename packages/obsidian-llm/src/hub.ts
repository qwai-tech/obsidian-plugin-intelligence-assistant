/**
 * The cross-plugin contract.
 *
 * Every Obsidian plugin that talks to an LLM currently ships its own provider
 * list, its own settings tab, and its own copy of the user's API keys. Sharing
 * code via this package fixes the first two. It does not fix the third: bundles
 * are per-plugin, so the user still types the same key N times.
 *
 * A "hub" is whichever installed plugin owns that configuration and is willing
 * to lend it out. Consumers discover it at runtime with {@link resolveLLM}.
 *
 * SECURITY -- the reason this interface looks the way it does:
 *
 * Obsidian has no permission model. Any enabled plugin can reach any other
 * plugin's exported object, so anything the hub exposes is exposed to every
 * plugin the user has installed, including ones they don't trust. Therefore the
 * hub lends out CAPABILITY, never CREDENTIALS: callers receive an
 * `ILLMProvider` that can make requests, and there is deliberately no method
 * that returns an `LLMConfig`, an `apiKey`, or a SAP `serviceKey`. A caller can use
 * the user's quota -- unavoidable, and the user consents by installing the
 * plugin -- but it cannot walk off with the key itself.
 *
 * Keep that invariant when extending this interface.
 */

import type { ILLMProvider, ModelInfo } from './types';

/**
 * Bumped only for a breaking change to {@link LLMHub}. Consumers compare against
 * their own expectation, because Obsidian offers no dependency or version
 * negotiation between plugins -- a hub may be older or newer than its caller
 * with nothing in the platform to prevent it.
 */
export const LLM_HUB_API_VERSION = 1;

/** Where a plugin publishes its hub. See {@link resolveLLM}. */
export const LLM_HUB_PROPERTY = 'llmHub';

export interface LLMHub {
	readonly apiVersion: number;

	/** Models the user has configured and enabled, across all their providers. */
	listModels(): Promise<ModelInfo[]>;

	/**
	 * A ready-to-use provider for `modelId`, or null when no configuration
	 * matches. The returned object carries no credentials the caller can read.
	 */
	getProvider(modelId: string): Promise<ILLMProvider | null>;

	/** The model the user picked as their default, if any. */
	getDefaultModelId(): Promise<string | null>;
}

export type ResolveLLMFailure =
	| { ok: false; reason: 'no-hub' }
	| { ok: false; reason: 'version-mismatch'; found: number; expected: number };

export type ResolveLLMResult = { ok: true; hub: LLMHub } | ResolveLLMFailure;

/** Minimal shape of the pieces of Obsidian's App this module touches. */
interface AppLike {
	plugins?: {
		enabledPlugins?: Set<string>;
		plugins?: Record<string, unknown>;
	};
}

/**
 * Find an LLM hub among the installed plugins.
 *
 * Every failure here is a normal runtime state, not an exception: Obsidian can't
 * express "this plugin depends on that one", so the hub may be missing,
 * disabled, loaded after the caller, or a version the caller doesn't understand.
 * Returning a tagged result rather than throwing pushes callers to degrade
 * gracefully -- fall back to their own configuration and say so -- instead of
 * crashing on a vault where the hub simply isn't present.
 *
 * @param app The Obsidian `App`.
 * @param opts.pluginIds Candidate hub plugin ids, tried in order.
 * @param opts.expectedApiVersion Version the caller was written against.
 */
export function resolveLLM(
	app: unknown,
	opts: { pluginIds: string[]; expectedApiVersion?: number },
): ResolveLLMResult {
	const expected = opts.expectedApiVersion ?? LLM_HUB_API_VERSION;
	const registry = (app as AppLike)?.plugins;

	for (const id of opts.pluginIds) {
		// A plugin can be installed but disabled; its object may linger.
		if (registry?.enabledPlugins && !registry.enabledPlugins.has(id)) continue;

		const instance = registry?.plugins?.[id] as Record<string, unknown> | undefined;
		const hub = instance?.[LLM_HUB_PROPERTY] as LLMHub | undefined;
		if (!hub || typeof hub.getProvider !== 'function') continue;

		if (hub.apiVersion !== expected) {
			return { ok: false, reason: 'version-mismatch', found: hub.apiVersion, expected };
		}
		return { ok: true, hub };
	}

	return { ok: false, reason: 'no-hub' };
}

/** Human-readable explanation of a {@link resolveLLM} failure. */
export function describeResolveFailure(failure: ResolveLLMFailure): string {
	if (failure.reason === 'no-hub') {
		return 'No LLM provider hub is installed or enabled; using this plugin\'s own configuration.';
	}
	return `LLM hub speaks API version ${failure.found}, this plugin expects ${failure.expected}; using own configuration.`;
}
