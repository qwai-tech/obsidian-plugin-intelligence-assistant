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
	chat(request: ChatRequest): Promise<ChatResponse>;
	streamChat(request: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<void>;
}
