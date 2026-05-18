import { requestUrl, RequestUrlParam } from 'obsidian';
import { IHttpClient, HttpRequestOptions, HttpResponse } from '@/core/interfaces';

/**
 * Obsidian-specific implementation of the HttpClient interface using requestUrl.
 */
export class ObsidianHttpClient implements IHttpClient {
	async request(options: HttpRequestOptions): Promise<HttpResponse> {
		const params: RequestUrlParam = {
			url: options.url,
			method: options.method || 'GET',
			headers: options.headers,
			body: options.body,
			contentType: options.contentType
		};

		const response = await requestUrl(params);

		return {
			status: response.status,
			text: response.text,
			json: response.json,
			headers: response.headers as Record<string, string>
		};
	}
}
