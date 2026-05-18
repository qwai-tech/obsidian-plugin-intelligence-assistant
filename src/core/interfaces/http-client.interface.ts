/**
 * Abstract interface for HTTP operations.
 */
export interface HttpResponse {
	status: number;
	text: string;
	json: any;
	headers: Record<string, string>;
}

export interface HttpRequestOptions {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
	contentType?: string;
}

export interface IHttpClient {
	request(_options: HttpRequestOptions): Promise<HttpResponse>;
}
