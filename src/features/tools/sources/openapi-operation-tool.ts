import type { HttpPort } from '@qwai/obsidian-llm';
import type { OpenApiAuthType } from '@/features/tools/types/openapi-tools';
import type { Tool, ToolDefinition, ToolResult, ToolExecutionContext } from '@/features/tools/types/tools';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';
export type ParameterLocation = 'path' | 'query' | 'header' | 'body';

type ToolArgumentValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null | undefined;

export interface ParameterMetadata {
	location: ParameterLocation;
	required: boolean;
}

export interface AuthConfig {
	type: OpenApiAuthType;
	key?: string;
	value?: string;
}

export interface OpenApiDocumentLike {
	paths?: Record<string, unknown>;
	servers?: Array<{ url?: string }>;
	info?: { title?: string };
}

export class OpenApiOperationTool implements Tool {
	definition: ToolDefinition;
	provider: string;

	constructor(
		definition: ToolDefinition,
		private readonly method: HttpMethod,
		private readonly pathTemplate: string,
		private readonly baseUrl: string,
		private readonly metadata: Record<string, ParameterMetadata>,
		providerId: string,
		private readonly auth: AuthConfig,
		private readonly http: HttpPort,
	) {
		this.definition = definition;
		this.provider = providerId;
	}

	async execute(args: Record<string, unknown>, context: ToolExecutionContext = {}): Promise<ToolResult> {
		try {
			const normalizedArgs: Record<string, ToolArgumentValue> = {};
			const sourceArgs = args ?? {};
			for (const key of Object.keys(sourceArgs)) {
				normalizedArgs[key] = this.normalizeArgumentValue(sourceArgs[key]);
			}

			const prepared = this.prepareRequest(normalizedArgs);
			const response = await this.http.request({
				url: prepared.url,
				method: this.method.toUpperCase(),
				headers: prepared.headers,
				body: prepared.body, signal: context.signal, retry: 'never',
			});

			const isJson = typeof response.headers?.['content-type'] === 'string' &&
				response.headers['content-type'].includes('application/json');
			const data: unknown = isJson ? response.json : response.text;

			if (response.status >= 400) {
				return {
					success: false,
					error: `HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`
				};
			}

			return {
				success: true,
				result: {
					status: response.status,
					body: data,
					headers: response.headers ?? {}
				}
			};
		} catch (error: unknown) {
			console.error('[OpenAPI] Tool execution failed', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	private prepareRequest(args: Record<string, ToolArgumentValue>): { url: string; headers: Record<string, string>; body?: string } {
		let resolvedPath = this.pathTemplate;
		const headers: Record<string, string> = { 'Accept': 'application/json' };
		const query = new URLSearchParams();
		let bodyPayload: unknown;

		for (const [name, meta] of Object.entries(this.metadata)) {
			const rawValue = args[name];
			const isEmptyString = typeof rawValue === 'string' && rawValue.trim() === '';
			if (meta.required && (rawValue === undefined || rawValue === null || isEmptyString)) {
				throw new Error(`Missing required parameter: ${name}`);
			}
			if (rawValue === undefined || rawValue === null) {
				continue;
			}

			if (meta.location === 'body') {
				bodyPayload = rawValue;
				continue;
			}

			const stringValue = this.stringifyValue(rawValue);
			if (meta.location === 'path') {
				const encoded = encodeURIComponent(stringValue);
				resolvedPath = resolvedPath.replace(new RegExp(`{${name}}`, 'g'), encoded);
			} else if (meta.location === 'query') {
				query.append(name, stringValue);
			} else if (meta.location === 'header') {
				headers[name] = stringValue;
			}
		}

		const unresolved = resolvedPath.match(/{([^}]+)}/g);
		if (unresolved && unresolved.length > 0) {
			throw new Error(`Missing path parameters: ${unresolved.join(', ')}`);
		}

		const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
		const pathPart = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
		const url = new URL(`${base}${pathPart}`);

		for (const [key, value] of query.entries()) {
			url.searchParams.append(key, value);
		}

		if (this.auth.type === 'query' && this.auth.key && this.auth.value) {
			url.searchParams.append(this.auth.key, this.auth.value);
		} else if (this.auth.type === 'header' && this.auth.key && this.auth.value) {
			headers[this.auth.key] = this.auth.value;
		}

		let body: string | undefined;
		if (bodyPayload !== undefined && this.method !== 'get' && this.method !== 'head') {
			if (!headers['Content-Type']) {
				headers['Content-Type'] = 'application/json';
			}
			body = typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload);
		}

		return {
			url: url.toString(),
			headers,
			body
		};
	}

	private normalizeArgumentValue(value: unknown): ToolArgumentValue {
		if (value === null || value === undefined) {
			return value;
		}
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return value;
		}
		if (Array.isArray(value)) {
			return value as Array<unknown>;
		}
		if (typeof value === 'object') {
			return value as Record<string, unknown>;
		}
		return 'unsupported-value';
	}

	private stringifyValue(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		try {
			return JSON.stringify(value);
		} catch {
			return '[unserializable-value]';
		}
	}
}
