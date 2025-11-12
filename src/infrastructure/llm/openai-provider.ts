import { BaseStreamingProvider, ParsedStreamChunk } from './base-streaming-provider';
import { ChatRequest, ChatResponse } from './types';

export class OpenAIProvider extends BaseStreamingProvider {
	get name(): string {
		return 'OpenAI';
	}

	protected getProviderName(): string {
		return 'OpenAI';
	}

	protected getHeaders(): Record<string, string> {
		return {
			...super.getHeaders(),
			'Authorization': `Bearer ${this.config.apiKey}`,
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = this.getBaseUrl('https://api.openai.com/v1') + '/chat/completions';

		const maxTokensValue = request.maxTokens ?? 2000;
		const modelName = this.extractModelName(request.model);
		const body: any = {
			model: modelName,
			messages: request.messages,
			temperature: request.temperature ?? 0.7,
			stream: false,
		};

		// Use max_completion_tokens for newer models (gpt-4o, gpt-4-turbo, etc.)
		// Use max_tokens for older models (gpt-4, gpt-3.5-turbo)
		if (this.shouldUseMaxCompletionTokens(modelName)) {
			body.max_completion_tokens = maxTokensValue;
		} else {
			body.max_tokens = maxTokensValue;
		}

		const response = await this.makeRequest(url, body);
		const data = response.json;

		return {
			content: data.choices[0].message.content,
			usage: {
				promptTokens: data.usage.prompt_tokens,
				completionTokens: data.usage.completion_tokens,
				totalTokens: data.usage.total_tokens,
			},
		};
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: any } {
		const url = this.getBaseUrl('https://api.openai.com/v1') + '/chat/completions';

		const maxTokensValue = request.maxTokens ?? 2000;
		const modelName = this.extractModelName(request.model);
		const body: any = {
			model: modelName,
			messages: request.messages,
			temperature: request.temperature ?? 0.7,
			stream: true,
		};

		// Use max_completion_tokens for newer models
		if (this.shouldUseMaxCompletionTokens(modelName)) {
			body.max_completion_tokens = maxTokensValue;
		} else {
			body.max_tokens = maxTokensValue;
		}

		return { url, body };
	}

	protected parseStreamChunk(data: any): ParsedStreamChunk | null {
		// Handle string "[DONE]" marker (already handled by base class)
		// This is here for documentation
		if (data === '[DONE]') {
			return { content: null, done: true };
		}

		// Extract content from OpenAI's structure
		const content = data.choices?.[0]?.delta?.content;
		if (content) {
			return { content, done: false };
		}

		// No content to process
		return null;
	}

	/**
	 * Determine if model should use max_completion_tokens instead of max_tokens
	 * Newer models (gpt-4o, gpt-4-turbo, gpt-5, o1, etc.) require max_completion_tokens
	 * Older models (gpt-4, gpt-3.5-turbo) use max_tokens
	 */
	private shouldUseMaxCompletionTokens(model: string | undefined): boolean {
		if (!model) {
			// Default model is gpt-4, which uses max_completion_tokens
			return true;
		}

		// Models that use max_tokens (old API)
		const oldModels = [
			'gpt-3.5-turbo',
			'gpt-4-0613',
			'gpt-4-32k',
		];

		// If it's explicitly an old model, use max_tokens
		if (oldModels.some(oldModel => model === oldModel || model.startsWith(oldModel))) {
			return false;
		}

		// All GPT-5 models use max_completion_tokens
		if (model.startsWith('gpt-5')) {
			return true;
		}

		// Check if it's a newer model that requires max_completion_tokens
		// Use startsWith to catch all variants (gpt-4o, gpt-4o-mini, gpt-4o-2024-*, etc.)
		if (model.startsWith('gpt-4o')) {
			return true;
		}
		if (model.startsWith('gpt-4-turbo')) {
			return true;
		}
		if (model.startsWith('o1-') || model.startsWith('o3-')) {
			return true;
		}

		// For base gpt-4 without specific version, check the date
		// Models from 2024+ likely use the new parameter
		if (model.startsWith('gpt-4-') && !model.includes('0613') && !model.includes('32k')) {
			return true;
		}

		// Default: for unknown models starting with gpt-4, use new parameter
		// This is safer as newer models are more likely to use the new parameter
		if (model.startsWith('gpt-4') && !oldModels.some(old => model.includes(old))) {
			return true;
		}

		// Default to old parameter for safety
		return false;
	}
}
