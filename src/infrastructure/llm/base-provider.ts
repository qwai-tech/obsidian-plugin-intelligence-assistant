import { ILLMProvider, ChatRequest, ChatResponse, StreamChunk } from './types';
import type { LLMConfig } from '@/types';
import { requestUrl } from 'obsidian';

export abstract class BaseLLMProvider implements ILLMProvider {
	protected config: LLMConfig;

	constructor(config: LLMConfig) {
		this.config = config;
	}

	abstract get name(): string;
	abstract chat(_request: ChatRequest): Promise<ChatResponse>;
	abstract streamChat(_request: ChatRequest, _onChunk: (_chunk: StreamChunk) => void): Promise<void>;

	generateEmbedding(_text: string, _model: string): Promise<number[]> {
		return Promise.reject(new Error(`Embedding generation not supported by ${this.name} provider.`));
	}

	protected getHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
		};
	}

	protected async makeRequest(url: string, body: unknown): Promise<unknown> {
		const response = await requestUrl({
			url,
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		});

		if (response.status !== 200) {
			const error = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
			throw new Error(`API request failed: ${response.status} ${error}`);
		}

		return response;
	}
}
