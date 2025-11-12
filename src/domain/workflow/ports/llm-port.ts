/**
 * LLM Port
 * Interface for LLM operations in workflows
 */

import type { Message, ChatResponse } from '@/types';

export interface ILLMPort {
	/**
	 * Send a chat request
	 */
	chat(messages: Message[], modelId: string): Promise<ChatResponse>;

	/**
	 * Check if model is available
	 */
	isModelAvailable(modelId: string): Promise<boolean>;

	/**
	 * Get available models
	 */
	getAvailableModels(): Promise<string[]>;
}
