/**
 * The wire-level contract every provider in this package speaks.
 *
 * These types deliberately stop at what actually crosses the network. A host
 * app's own message model is usually much richer -- provenance, RAG sources,
 * agent traces, rendering hints -- but none of that belongs in a provider, and
 * baking it in here would make the package unusable by any plugin that doesn't
 * share the same domain model. `LLMMessage` is therefore the minimum a provider
 * needs, and a richer host type stays structurally assignable to it.
 */

export interface LLMAttachment {
	type: 'file' | 'image';
	name: string;
	path: string;
	content?: string;
}

export interface LLMMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	/** Retrieved data that may be trimmed; never executable policy. */
	context?: boolean;
	content: string;
	reasoningContent?: string;
	/** Wire passthrough for tool calling (OpenAI chat-completions shape). */
	name?: string;
	tool_calls?: unknown;
	tool_call_id?: string;
	attachments?: LLMAttachment[];
}

export interface ChatRequest {
	messages: LLMMessage[];
	model: string;
	signal?: AbortSignal;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	inputTokenBudget?: number;
	contextTokenLimit?: number;
	conversationId?: string;
	purpose?: string;

	// Common sampling parameters
	topP?: number;
	topK?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	stop?: string | string[];
	stopSequences?: string[];

	// Azure OpenAI / OpenAI specific parameters
	maxCompletionTokens?: number;
	n?: number;
	logitBias?: Record<string, number>;
	logprobs?: boolean;
	topLogprobs?: number;
	user?: string;
	seed?: number;

	responseFormat?: {
		type: 'text' | 'json_object' | 'json_schema';
		json_schema?: {
			name: string;
			description?: string;
			schema: Record<string, unknown>;
			strict?: boolean;
		};
	};

	streamOptions?: {
		include_usage?: boolean;
	};

	tools?: Array<{
		type: 'function';
		function: {
			name: string;
			description?: string;
			parameters?: Record<string, unknown>;
			strict?: boolean;
		};
	}>;
	toolChoice?: 'none' | 'auto' | 'required' | {
		type: 'function';
		function: { name: string };
	};
	parallelToolCalls?: boolean;

	dataSources?: unknown[];

	audio?: {
		voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
		format?: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
	};
	modalities?: Array<'text' | 'audio'>;

	prediction?: {
		type: 'content';
		content: string | Array<{ type: 'text'; text: string }>;
	};
	metadata?: Record<string, string>;
	store?: boolean;
	reasoningEffort?: 'low' | 'medium' | 'high';
	/** Explicit DeepSeek-compatible mode control; omitted preserves the server default. */
	thinking?: { type: 'enabled' | 'disabled' };

	userSecurityContext?: {
		userId?: string;
		ipAddress?: string;
		userAgent?: string;
	};
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface ChatResponse {
	toolCalls?: StreamChunk['toolCalls'];
	content: string;
	reasoning?: string;
	usage?: TokenUsage;
}

export interface StreamChunk {
	content: string;
	reasoning?: string;
	done: boolean;
	usage?: TokenUsage;
	toolCalls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
}

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
	/** Human-readable configured connection, without credentials. */
	providerLabel?: string;
	capabilities: ModelCapability[];
	enabled: boolean;
	/** SAP AI Core deployment metadata retained alongside the model cache. */
	deploymentId?: string;
	deploymentUrl?: string;
	configurationId?: string;
	configurationName?: string;
	scenarioId?: string;
	executableId?: string;
	modelVersion?: string;
	status?: string;
	targetStatus?: string;
	createdAt?: string;
	modifiedAt?: string;
	submissionTime?: string;
	startTime?: string;
	completionTime?: string;
}

export interface ProviderCapabilities {
	chat: boolean;
	embeddings: boolean;
	streaming: boolean;
	functions: boolean;
	models: boolean;
}

export interface ModelConfig {
	id: string;
	name: string;
	maxTokens: number;
	contextWindow: number;
	supportsFunctions: boolean;
	capabilities: string[];
}

/**
 * Everything needed to talk to one provider endpoint, credentials included.
 *
 * Treat values of this type as secret. The hub API in `hub.ts` exists so that
 * callers can obtain a working provider WITHOUT being handed one of these.
 */
export interface LLMConfig {
	provider: string;
	/** Stable identity of a configured connection, independent of its endpoint. */
	id?: string;
	name?: string;
	apiKey?: string;
	baseUrl?: string;
	modelFilter?: string;
	/** SAP AI Core service key. Treat the complete value as a credential. */
	serviceKey?: string | Record<string, unknown>;
	resourceGroup?: string;
	cachedModels?: ModelInfo[];
	cacheTimestamp?: number;
}

export interface LLMProviderConfig {
	apiKey: string;
	baseUrl?: string;
	defaultModel?: string;
	timeout?: number;
	[key: string]: unknown;
}

export interface TokenCount {
	count: number;
	model: string;
}

export interface ValidationResult {
	success: boolean;
	errors: string[];
}

export interface ConnectionTest {
	success: boolean;
	message: string;
	models?: string[];
}

export interface ILLMProvider {
	readonly name: string;
	readonly version?: string;
	readonly capabilities?: ProviderCapabilities;
	readonly models?: ModelConfig[];
	readonly isInitialized?: boolean;

	chat(_request: ChatRequest): Promise<ChatResponse>;
	streamChat(_request: ChatRequest, _onChunk: (_chunk: StreamChunk) => void): Promise<void>;
	generateEmbedding?(_text: string, _model: string, _options?: { signal?: AbortSignal }): Promise<number[]>;
	initialize?(_config: LLMProviderConfig): Promise<void>;
	countTokens?(_text: string, _model?: string): Promise<TokenCount>;
	validateConfig?(_config: LLMProviderConfig): ValidationResult;
	testConnection?(_config?: LLMProviderConfig): Promise<ConnectionTest>;
	cleanup?(): Promise<void>;
}
