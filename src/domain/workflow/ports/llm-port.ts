/**
 * LLM Port
 * Interface for LLM operations in workflows
 */

import type { Message, ChatResponse } from '@/types';

export interface ILLMPort {
	/**
	 * Send a chat request
	 */
	chat(_messages: Message[], _modelId: string): Promise<ChatResponse>;

	/**
	 * Check if model is available
	 */
	isModelAvailable(_modelId: string): Promise<boolean>;

	/**
	 * Get available models
	 */
	getAvailableModels(): Promise<string[]>;
}
