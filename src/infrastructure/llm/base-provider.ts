import { ILLMProvider, ChatRequest, ChatResponse, StreamChunk } from './types';
import type { LLMConfig } from '@/types';
import { requestUrl } from 'obsidian';

export abstract class BaseLLMProvider implements ILLMProvider {
	protected config: LLMConfig;

	constructor(config: LLMConfig) {
		this.config = config;
	}

	abstract get name(): string;
	abstract chat(request: ChatRequest): Promise<ChatResponse>;
	abstract streamChat(request: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<void>;

	protected getHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
		};
	}

	protected async makeRequest(url: string, body: any): Promise<any> {
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
