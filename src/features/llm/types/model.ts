/**
 * Model Core Types
 * Domain types for LLM models and configurations.
 *
 * These now live in `@qwai/obsidian-llm` and are re-exported here. Keeping a
 * second copy in the app would let the two definitions drift, and since
 * `ModelManager` (in the package) produces `ModelInfo` values that the app stores
 * in its settings, any drift would surface as a confusing structural type error
 * far from its cause.
 */
import type { LLMConfig as EndpointConfig } from '@qwai/obsidian-llm';

export type { ModelCapability, ModelInfo } from '@qwai/obsidian-llm';

export interface LLMConfig extends EndpointConfig {
	apiKeySecret?: string;
}
