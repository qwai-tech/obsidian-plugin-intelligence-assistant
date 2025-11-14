/**
 * Plugin LLM Adapter
 * Implements LLM port using plugin LLM service
 */

import type { ILLMPort } from '../ports/llm-port';
import type { Message, ChatResponse } from '@/types';
import { LLMService } from '@/application/services/llm-service';

export class PluginLLMAdapter implements ILLMPort {
	constructor(private readonly _llmService: LLMService) {}

	async chat(messages: Message[], modelId: string): Promise<ChatResponse> {
		return await this._llmService.chat(modelId, messages);
	}

	isModelAvailable(modelId: string): Promise<boolean> {
		const model = this._llmService.getModel(modelId);
		return Promise.resolve(model !== null);
	}

	getAvailableModels(): Promise<string[]> {
		const models = this._llmService.getAllModels();
		return Promise.resolve(models.map(m => m.id));
	}
}
