import { BaseLLMProvider } from './base-provider';
import { ChatRequest, ChatResponse, StreamChunk } from './types';
import type { ModelCapability, ModelInfo } from '@/types';
import { requestUrl } from 'obsidian';

interface OllamaChatApiResponse {
	message?: { content?: string };
	prompt_eval_count?: number;
	eval_count?: number;
}

interface OllamaModelsResponse {
	models?: Array<{ name: string; [key: string]: unknown }>;
}

/**
 * Ollama Provider using native Ollama API
 * API Documentation: https://docs.ollama.com/api
 */
export class OllamaProvider extends BaseLLMProvider {
	get name(): string {
		return 'Ollama';
	}

	protected getHeaders(): Record<string, string> {
		// Ollama API uses simple JSON requests without authentication by default
		return {
			'Content-Type': 'application/json',
		};
	}

	private getBaseUrl(): string {
		return this.config.baseUrl || 'http://localhost:11434';
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = `${this.getBaseUrl()}/api/chat`;

		// Extract model name from provider-prefixed ID (ollama:model-name -> model-name)
		const modelName = request.model.includes(':') ? request.model.split(':').slice(1).join(':') : request.model;

		const body = {
			model: modelName,
			messages: request.messages,
			stream: false,
			options: {
				temperature: request.temperature ?? 0.7,
				num_predict: request.maxTokens ?? 2000,
			},
		};

		const response = await requestUrl({
			url: url,
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		});

		if (response.status < 200 || response.status >= 300) {
			const errorText = String(response.text);
			throw new Error(`Ollama API request failed: ${String(response.status)} ${errorText}`);
		}

		const data = response.json as OllamaChatApiResponse;

		return {
			content: data.message?.content ?? '',
			usage: {
				promptTokens: data.prompt_eval_count ?? 0,
				completionTokens: data.eval_count ?? 0,
				totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
			},
		};
	}

	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		const url = `${this.getBaseUrl()}/api/chat`;

		// Extract model name from provider-prefixed ID (ollama:model-name -> model-name)
		const modelName = request.model.includes(':') ? request.model.split(':').slice(1).join(':') : request.model;

		const requestBody = {
			model: modelName,
			messages: request.messages,
			stream: true,
			options: {
				temperature: request.temperature ?? 0.7,
				num_predict: request.maxTokens ?? 2000,
			},
		};

		try {
			const response = await requestUrl({
				url: url,
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(requestBody),
			});

		if (response.status < 200 || response.status >= 300) {
			const errorText = response.text;
			throw new Error(`Ollama API request failed: ${String(response.status)} ${String(errorText)}`);
		}

		// Type guard for response body (Obsidian RequestUrlResponse may not declare 'body')
		const bodyUnknown: ReadableStream<Uint8Array> | undefined = (response as { body?: ReadableStream<Uint8Array> }).body;
		if (!bodyUnknown) {
			throw new Error('Response body is null');
		}
		if (!(bodyUnknown instanceof ReadableStream)) {
			throw new Error('Response body is not a ReadableStream');
		}

		const reader = bodyUnknown.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

					if (value) {
						buffer += decoder.decode(value, { stream: true });
					}
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.trim()) {
						try {
							const parsed = JSON.parse(line) as {
								message?: { content?: string };
								done?: boolean;
							};

							// Ollama sends content in message.content field
							const content = parsed.message?.content;
							if (content) {
								onChunk({ content, done: false });
							}

							// Check if streaming is done
							if (parsed.done === true) {
								onChunk({ content: '', done: true });
								return;
							}
						} catch (e) {
							console.error('[Ollama] Failed to parse JSON line:', e);
						}
					}
				}
			}

			onChunk({ content: '', done: true });
		} catch (error) {
			console.error('[Ollama] Stream error:', error);
			throw error;
		}
	}

	/**
	 * Fetch available models from Ollama API
	 * API Documentation: https://docs.ollama.com/api#list-models
	 */
	async fetchModels(): Promise<ModelInfo[]> {
		const baseUrl = this.getBaseUrl();
		console.debug(`[Ollama] Fetching models from: ${baseUrl ?? 'unknown'}/api/tags`);

		try {
			const url = `${baseUrl ?? 'unknown'}/api/tags`;

			console.debug('[Ollama] Making request to Ollama API...');
			const response = await requestUrl({
				url: url,
				method: 'GET',
				headers: this.getHeaders(),
			});

			console.debug(`[Ollama] Response status: ${response.status}`);

			if (response.status < 200 || response.status >= 300) {
				const errorText = response.text;
				console.error('[Ollama] API error response:', response.status, errorText);
				throw new Error(`Failed to fetch Ollama models: ${response.status} - ${errorText}`);
			}

			const data = JSON.parse(response.text) as OllamaModelsResponse;
			console.debug('[Ollama] Response data:', JSON.stringify(data, null, 2));

			// Check if models array exists
			if (!data || !data.models || !Array.isArray(data.models)) {
				console.error('[Ollama] Invalid response format. Expected {models: []}, got:', data);
				throw new Error('Invalid response format from Ollama API. Make sure Ollama is running.');
			}

			if (data.models.length === 0) {
				console.warn('[Ollama] No models found. Have you pulled any models? Run: ollama pull llama3.2');
				return [];
			}

			// Map Ollama models to ModelInfo format
			const models = data.models.map((model: { name: string; [key: string]: unknown }) => {
				const capabilities = this.inferCapabilities(model.name);

				return {
					id: `ollama:${model.name ?? 'unknown'}`,
					name: model.name,
					provider: 'ollama',
					capabilities: capabilities,
					enabled: true
				};
			});

			console.debug(`[Ollama] Successfully fetched ${models.length} models:`, models.map((m: ModelInfo) => m.name).join(', '));
			return models;
		} catch (error: unknown) {
			console.error('[Ollama] Failed to fetch models:', error);

			// Type guard for error with message property
			const errorMessage = error instanceof Error ? error.message : String(error);

			console.error('[Ollama] Error details:', {
				message: errorMessage,
				baseUrl: baseUrl,
				suggestion: 'Make sure Ollama is running. Run: ollama serve'
			});

			// Check if it's a connection error
			if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('ECONNREFUSED')) {
				console.error('[Ollama] Connection refused. Is Ollama running on', baseUrl, '?');
				console.error('[Ollama] Try running: ollama serve');
			}

			// Return empty array instead of throwing to allow graceful degradation
			return [];
		}
	}

	/**
	 * Infer model capabilities from model name
	 */
	private inferCapabilities(modelName: string): ModelCapability[] {
		const capabilities: ModelCapability[] = ['chat', 'streaming'];

		// Check for vision models (common vision model patterns)
		if (modelName.includes('vision') || 
			modelName.includes('llava') || 
			modelName.includes('llama-vision') ||
			modelName.includes('phi3-vision') ||
			modelName.includes('qwen-vl')) {
			capabilities.push('vision');
		}

		// Check for reasoning models
		if (modelName.includes('reasoning') || modelName.includes('r1')) {
			capabilities.push('reasoning');
		}

		// Check for embedding models
		if (modelName.includes('embedding') || modelName.includes('nomic-embed')) {
			return ['embedding'];
		}

		// Most modern models support function calling
		capabilities.push('function_calling');

		return capabilities;
	}

	/**
	 * Pull a model from Ollama registry
	 * API Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md#pull-a-model
	 */
	async pullModel(modelName: string, onProgress?: (_progress: { status: string; completed: number; total: number; percentage: number; }) => void): Promise<void> {
		const url = `${this.getBaseUrl()}/api/pull`;

		const requestBody = {
			name: modelName,
			stream: true // Enable streaming to get progress updates
		};

		try {
			const response = await requestUrl({
				url: url,
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(requestBody),
			});

		if (response.status < 200 || response.status >= 300) {
			const errorText = response.text;
			throw new Error(`Failed to pull model: ${String(response.status)} ${String(errorText)}`);
		}

		// Type guard for response body (Obsidian RequestUrlResponse may not declare 'body')
		const bodyUnknown: ReadableStream<Uint8Array> | undefined = (response as { body?: ReadableStream<Uint8Array> }).body;
		if (!bodyUnknown) {
			throw new Error('Response body is null');
		}
		if (!(bodyUnknown instanceof ReadableStream)) {
			throw new Error('Response body is not a ReadableStream');
		}

		// Handle streaming response for progress updates
		const reader = bodyUnknown.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

					if (value) {
						buffer += decoder.decode(value, { stream: true });
					}
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.trim()) {
						try {
							const parsed = JSON.parse(line) as {
								status?: string;
								completed?: number;
								total?: number;
							};

							// Handle different response formats
							if (parsed.status) {
								let completed = 0;
								let total = 100; // Default assumption

								// Calculate progress based on status message
								if (parsed.completed && parsed.total) {
									completed = parsed.completed;
									total = parsed.total;
								} else if (parsed.status.includes('pulling')) {
									// Estimate progress based on status
									if (parsed.status.includes('pulling')) {
										completed = 20;
									} else if (parsed.status.includes('verifying')) {
										completed = 50;
									} else if (parsed.status.includes('extracting')) {
										completed = 80;
									} else if (parsed.status.includes('success') || parsed.status.includes('complete')) {
										completed = 100;
									}
								}

								const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

								onProgress?.({
									status: parsed.status,
									completed,
									total,
									percentage
								});
							}
						} catch (e) {
							console.error('[Ollama] Failed to parse JSON line during pull:', e);
							console.error('[Ollama] Problematic line:', line);
						}
					}
				}
			}
			
			console.debug(`[Ollama] Successfully pulled model: ${modelName ?? 'unknown'}`);
		} catch (error) {
			console.error(`[Ollama] Failed to pull model ${modelName ?? 'unknown'}:`, error);
			throw error;
		}
	}

	/**
	 * Remove/delete a model from Ollama
	 * API Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md#delete-a-model
	 */
	async removeModel(modelName: string): Promise<void> {
		const url = `${this.getBaseUrl()}/api/delete`;
		
		const body = {
			name: modelName
		};

		try {
			const response = await requestUrl({
				url: url,
				method: 'DELETE',
				headers: this.getHeaders(),
				body: JSON.stringify(body),
			});

			if (response.status < 200 || response.status >= 300) {
				const errorText = response.text;
				throw new Error(`Failed to remove model: ${String(response.status)} ${String(errorText)}`);
			}

			console.debug(`[Ollama] Successfully removed model: ${modelName ?? 'unknown'}`);
		} catch (error) {
			console.error(`[Ollama] Failed to remove model ${modelName ?? 'unknown'}:`, error);
			throw error;
		}
	}

	/**
	 * Check if a model exists in Ollama
	 */
	async modelExists(modelName: string): Promise<boolean> {
		try {
			const models = await this.fetchModels();
			return models.some(model => model.id === modelName);
		} catch (error) {
			console.error(`[Ollama] Failed to check if model exists ${modelName ?? 'unknown'}:`, error);
			return false;
		}
	}
}
