/**
 * Model Core Types
 * Domain types for LLM models and configurations
 */

export type ModelCapability =
	| 'chat'
	| 'vision'
	| 'audio'
	| 'video'
	| 'function_calling'
	| 'streaming'
	| 'json_mode'
	| 'reasoning'
	| 'embedding'
	| 'computer_use'
	| 'multimodal_output'
	| 'code_execution';

export interface ModelInfo {
	id: string;
	name: string;
	provider: string;
	capabilities: ModelCapability[];
	enabled: boolean;
	// SAP AI Core specific fields
	deploymentId?: string;
	scenarioId?: string;
	executableId?: string;
}

export interface LLMConfig {
	provider: string;
	apiKey?: string;  // Optional for Ollama
	baseUrl?: string;
	modelFilter?: string;
	serviceKey?: string | Record<string, any>;  // For SAP AI Core
	resourceGroup?: string;  // For SAP AI Core
	cachedModels?: ModelInfo[];
	cacheTimestamp?: number;
}
