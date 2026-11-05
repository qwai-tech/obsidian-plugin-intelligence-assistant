import { BaseLLMProvider } from '../base-provider';
import type { HttpPort, HttpRequest } from '../http';
import type { ChatRequest, ChatResponse, StreamChunk, ILLMProvider } from '../types';
import { SAPConnection } from './sap-connection';
import { OpenAIProvider } from './openai-provider';
import { GoogleProvider } from './google-provider';
import { BedrockProtocolProvider } from './bedrock-protocol-provider';

/** Tenant routing and authentication compose shared protocol providers without exposing credentials. */
export class SAPAICoreProvider extends BaseLLMProvider {
	private readonly connection = new SAPConnection(this.config, this.http);
	get name(): string { return 'SAP AI Core'; }
	fetchModels(signal?: AbortSignal) { return this.connection.fetchModels(signal); }
	getDeploymentDetails(id: string, signal?: AbortSignal) { return this.connection.getDeploymentDetails(id, signal); }
	checkDeploymentHealth(id: string, signal?: AbortSignal) { return this.connection.checkDeploymentHealth(id, signal); }
	listDeployments(status?: string, signal?: AbortSignal) { return this.connection.listDeployments(status, signal); }
	async chat(request: ChatRequest): Promise<ChatResponse> {
		const resolved = await this.resolve(request.model, request.signal);
		return resolved.provider.chat({ ...request, model: resolved.model });
	}
	async streamChat(request: ChatRequest, onChunk: (chunk: StreamChunk) => void): Promise<void> {
		const resolved = await this.resolve(request.model, request.signal);
		await resolved.provider.streamChat({ ...request, model: resolved.model }, onChunk);
	}
	async generateEmbedding(text: string, model: string, options?: { signal?: AbortSignal }): Promise<number[]> {
		const resolved = await this.resolve(model, options?.signal, true);
		if (!resolved.provider.generateEmbedding) throw new Error('SAP embedding deployment is unsupported');
		return resolved.provider.generateEmbedding(text, resolved.model, options);
	}
	private async resolve(modelId: string, signal?: AbortSignal, embedding = false): Promise<{ provider: ILLMProvider; model: string }> {
		const deployment = await this.connection.resolve(modelId, signal);
		const executable = deployment.executableId;
		if (embedding && executable !== 'azure-openai') throw new Error('SAP embeddings require an Azure OpenAI embedding deployment');
		const base = deployment.deploymentUrl?.replace(/\/$/, '') || `${this.connection.apiBaseUrl}/v2/inference/deployments/${encodeURIComponent(deployment.id)}`;
		const endpoint = new URL(base);
		if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('SAP deployment URL must be an HTTPS endpoint without embedded credentials or query parameters');
		const headers = await this.connection.getAuthHeaders(signal);
		const transform = (request: HttpRequest): HttpRequest => {
			if (!request.url.startsWith(`${base}/`)) throw new Error('SAP protocol attempted an unrelated endpoint');
			let url = request.url;
			let body = request.body;
			if (executable === 'azure-openai') {
				url += `${url.includes('?') ? '&' : '?'}api-version=${/^(gpt-5|gpt-4\.1|o[134])/.test(deployment.modelName) ? '2025-04-01-preview' : '2024-10-21'}`;
				if (typeof body === 'string') { const json = JSON.parse(body) as Record<string, unknown>; delete json.model; body = JSON.stringify(json); }
			}
			// Drop upstream provider key headers; SAP OAuth is the only credential sent.
			return { ...request, url, body, headers, retry: 'never' };
		};
		const http: HttpPort = { request: request => this.http.request(transform(request)), stream: request => this.http.stream(transform(request)) };
		const config = { provider: executable ?? 'openai', baseUrl: base };
		const provider = executable === 'gcp-vertexai' ? new GoogleProvider(config, http) : executable === 'aws-bedrock' ? new BedrockProtocolProvider(config, http) : new OpenAIProvider(config, http);
		return { provider, model: deployment.modelName };
	}
}
