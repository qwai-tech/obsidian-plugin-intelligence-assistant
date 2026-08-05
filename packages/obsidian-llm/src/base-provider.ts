import { ILLMProvider, ChatRequest, ChatResponse, StreamChunk } from './types';
import type { LLMConfig } from './types';
import { type HttpPort, getDefaultHttpPort } from './http';

export abstract class BaseLLMProvider implements ILLMProvider {
	protected config: LLMConfig;
	/**
	 * How this provider reaches the network. Injected rather than imported so the
	 * provider carries no environment assumptions -- Obsidian supplies a
	 * CORS-exempt port, tests supply a fake, Node supplies plain fetch.
	 */
	protected http: HttpPort;

	constructor(config: LLMConfig, http: HttpPort = getDefaultHttpPort()) {
		this.config = config;
		this.http = http;
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
		const response = await this.http.request({
			url,
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		});

		if (response.status !== 200) {
			throw new Error(`API request failed: ${response.status} ${response.text}`);
		}

		return response;
	}
}
