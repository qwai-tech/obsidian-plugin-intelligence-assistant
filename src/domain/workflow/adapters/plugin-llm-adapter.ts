/**
 * Plugin LLM Adapter
 * Implements LLM port using plugin LLM service
 */

import type { ILLMPort } from '../ports/llm-port';
import type { Message, ChatResponse } from '@/types';
import { LLMService } from '@/application/services/llm-service';

export class PluginLLMAdapter implements ILLMPort {
	constructor(private llmService: LLMService) {}

	async chat(messages: Message[], modelId: string): Promise<ChatResponse> {
		return await this.llmService.chat(modelId, messages);
	}

	async isModelAvailable(modelId: string): Promise<boolean> {
		const model = this.llmService.getModel(modelId);
		return model !== null;
	}

	async getAvailableModels(): Promise<string[]> {
		const models = this.llmService.getAllModels();
		return models.map(m => m.id);
	}
}
