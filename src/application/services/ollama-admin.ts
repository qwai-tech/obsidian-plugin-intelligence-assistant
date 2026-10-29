import type { HttpPort, HttpRequest } from '@qwai/obsidian-llm';

const PULL_TIMEOUT_MS = 30 * 60_000;

export interface OllamaStatus {
	online: boolean;
	version?: string;
}

export class OllamaAdmin {
	constructor(private readonly http: HttpPort) {}

	async status(baseUrl: string): Promise<OllamaStatus> {
		try {
			const response = await this.http.request({ url: endpoint(baseUrl, 'version'), method: 'GET' });
			return response.status === 200
				? { online: true, version: (response.json as { version?: string } | undefined)?.version }
				: { online: false };
		} catch {
			return { online: false };
		}
	}

	async pull(baseUrl: string, model: string): Promise<void> {
		await this.send({ url: endpoint(baseUrl, 'pull'), method: 'POST', timeoutMs: PULL_TIMEOUT_MS, ...jsonBody({ name: model }) });
	}

	async remove(baseUrl: string, model: string): Promise<void> {
		await this.send({ url: endpoint(baseUrl, 'delete'), method: 'DELETE', ...jsonBody({ name: model }) });
	}

	private async send(request: HttpRequest): Promise<void> {
		const response = await this.http.request(request);
		if (!response.ok) {
			throw new Error(response.text || `HTTP ${response.status}`);
		}
	}
}

function endpoint(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/api/${path}`;
}

function jsonBody(body: unknown): Pick<HttpRequest, 'headers' | 'body'> {
	return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
