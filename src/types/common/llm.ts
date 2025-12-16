/**
 * LLM Common Types
 * Shared types for LLM providers
 */

import type { Message } from '../core/conversation';

export interface ChatRequest {
	messages: Message[];
	model: string;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;

	// Common sampling parameters
	topP?: number;
	topK?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	stop?: string | string[];
	stopSequences?: string[];

	// Azure OpenAI / OpenAI specific parameters
	maxCompletionTokens?: number;  // Upper bound for completion tokens (includes reasoning tokens)
	n?: number;  // Number of completions to generate
	logitBias?: Record<string, number>;  // Modify token likelihood
	logprobs?: boolean;  // Return log probabilities
	topLogprobs?: number;  // Number of most likely tokens to return (0-20)
	user?: string;  // Unique identifier for end-user
	seed?: number;  // Deterministic sampling seed

	// Response format (JSON mode, structured outputs)
	responseFormat?: {
		type: 'text' | 'json_object' | 'json_schema';
		json_schema?: {
			name: string;
			description?: string;
			schema: Record<string, unknown>;
			strict?: boolean;
		};
	};

	// Streaming options
	streamOptions?: {
		include_usage?: boolean;
	};

	// Function calling / Tools
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

	// Azure OpenAI specific
	dataSources?: unknown[];  // Azure OpenAI chat extensions

	// Audio output (for models that support it)
	audio?: {
		voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
		format?: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
	};
	modalities?: Array<'text' | 'audio'>;

	// Advanced features
	prediction?: {
		type: 'content';
		content: string | Array<{
			type: 'text';
			text: string;
		}>;
	};
	metadata?: Record<string, string>;  // Developer-defined tags
	store?: boolean;  // Store output for model distillation
	reasoningEffort?: 'low' | 'medium' | 'high';  // For o1 models

	// Security context
	userSecurityContext?: {
		userId?: string;
		ipAddress?: string;
		userAgent?: string;
	};
}

export interface ChatResponse {
	content: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface StreamChunk {
	content: string;
	done: boolean;
	reasoning?: string;
}

export interface ILLMProvider {
	name: string;
	chat(_request: ChatRequest): Promise<ChatResponse>;
	streamChat(_request: ChatRequest, _onChunk: (_chunk: StreamChunk) => void): Promise<void>;
}
