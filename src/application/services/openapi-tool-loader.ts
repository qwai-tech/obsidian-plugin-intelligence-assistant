import { normalizePath, requestUrl } from 'obsidian';
import { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig, OpenApiAuthType } from '@/types';
import type { Tool, ToolDefinition, ToolParameter, ToolResult } from './types';
import { ToolManager } from './tool-manager';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';
type ParameterLocation = 'path' | 'query' | 'header' | 'body';

type ToolArgumentValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null | undefined;

interface ParameterMetadata {
	location: ParameterLocation;
	required: boolean;
}

interface AuthConfig {
	type: OpenApiAuthType;
	key?: string;
	value?: string;
}

interface OpenApiDocumentLike {
	paths?: Record<string, unknown>;
	servers?: Array<{ url?: string }>;
	info?: { title?: string };
}

interface ReloadOptions {
	forceRefetch?: boolean;
	persistCacheMetadata?: boolean;
}

class OpenApiOperationTool implements Tool {
	definition: ToolDefinition;
	provider: string;

	constructor(
		definition: ToolDefinition,
		private readonly method: HttpMethod,
		private readonly pathTemplate: string,
		private readonly baseUrl: string,
		private readonly metadata: Record<string, ParameterMetadata>,
		providerId: string,
		private readonly auth: AuthConfig
	) {
		this.definition = definition;
		this.provider = providerId;
	}

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const normalizedArgs: Record<string, ToolArgumentValue> = {};
			const sourceArgs = args ?? {};
			for (const key of Object.keys(sourceArgs)) {
				normalizedArgs[key] = this.normalizeArgumentValue(sourceArgs[key]);
			}

			const prepared = this.prepareRequest(normalizedArgs);
			const response = await requestUrl({
				url: prepared.url,
				method: this.method.toUpperCase(),
				headers: prepared.headers,
				body: prepared.body
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
		} catch (_error) {
			return '[unserializable-value]';
		}
	}
}

// ---------------------------------------------------------------------------
// Module-level helper functions (moved from OpenApiToolLoader class methods)
// ---------------------------------------------------------------------------

async function loadSpec(
	config: OpenApiToolConfig,
	fileSystem: IFileSystem,
	pluginDataPath: string,
	options?: ReloadOptions
): Promise<string> {
	if (config.sourceType === 'url') {
		return await loadRemoteSpec(config, fileSystem, pluginDataPath, options);
	}
	return await loadLocalSpec(config.specPath ?? '', fileSystem);
}

async function loadLocalSpec(specPath: string, fileSystem: IFileSystem): Promise<string> {
	if (!specPath) {
		throw new Error('OpenAPI file path is required');
	}

	const normalized = normalizePath(specPath);
	try {
		return await fileSystem.read(normalized);
	} catch (error) {
		console.error(`[OpenAPI] Failed to read spec from ${normalized}`, error);
		throw error instanceof Error ? error : new Error('Unable to read OpenAPI spec');
	}
}

async function loadRemoteSpec(
	config: OpenApiToolConfig,
	fileSystem: IFileSystem,
	pluginDataPath: string,
	options?: ReloadOptions
): Promise<string> {
	if (!config.specUrl?.trim()) {
		throw new Error('OpenAPI URL is required');
	}

	const cache = getCachePaths(config.id, pluginDataPath);
	await fileSystem.mkdir(cache.directoryAbsolute);
	const shouldRefetch = options?.forceRefetch ?? false;
	const cacheExists = await fileSystem.exists(cache.absolutePath);

	if (!cacheExists || shouldRefetch) {
		const response = await requestUrl({ url: config.specUrl.trim(), method: 'GET' });
		const contents = response.text;
		await fileSystem.write(cache.absolutePath, contents);
		if (options?.persistCacheMetadata) {
			config.lastFetchedAt = Date.now();
		}
		return contents;
	}

	return await fileSystem.read(cache.absolutePath);
}

function getCachePaths(configId: string, pluginDataPath: string): { absolutePath: string; directoryAbsolute: string } {
	const directoryAbsolute = `${pluginDataPath}/openapi`;
	const absolutePath = `${directoryAbsolute}/${configId}.json`;
	return { absolutePath: normalizePath(absolutePath), directoryAbsolute: normalizePath(directoryAbsolute) };
}

function extractServerUrl(spec: OpenApiDocumentLike): string | undefined {
	const servers = spec.servers;
	if (Array.isArray(servers) && servers.length > 0) {
		const server = servers[0];
		if (server && typeof server === 'object' && typeof server.url === 'string') {
			const url = server.url.trim();
			return url ? url : undefined;
		}
	}
	return undefined;
}

function sanitizeNamespace(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'openapi';
}

function generateTools(
	spec: OpenApiDocumentLike,
	baseUrl: string,
	providerId: string,
	namespace: string,
	auth: AuthConfig
): Tool[] {
	const paths = spec.paths;
	if (!paths) {
		return [];
	}

	const httpMethods: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];
	const tools: Tool[] = [];
	const usedNames = new Set<string>();

	for (const [pathKey, rawPathItem] of Object.entries(paths)) {
		if (!rawPathItem || typeof rawPathItem !== 'object') {
			continue;
		}
		const pathItem = rawPathItem as Record<string, unknown>;
		for (const method of httpMethods) {
			const operation = pathItem[method];
			if (!operation || typeof operation !== 'object') {
				continue;
			}
			const operationDef = operation as Record<string, unknown>;
			if (operationDef.deprecated === true) {
				continue;
			}

			const operationId = buildOperationId(namespace, method, pathKey, operationDef, usedNames);
			const { parameters, metadata } = buildParameters(pathItem, operationDef);
			const requestBody = buildRequestBody(operationDef, metadata);
			const description = buildDescription(operationDef, method, pathKey);
			const definition: ToolDefinition = {
				name: operationId,
				description,
				parameters: [...parameters, ...requestBody]
			};
			const tool = new OpenApiOperationTool(definition, method, pathKey, baseUrl, metadata, providerId, auth);
			tools.push(tool);
		}
	}

	return tools;
}

function buildParameters(
	pathItem: Record<string, unknown>,
	operation: Record<string, unknown>
): { parameters: ToolParameter[]; metadata: Record<string, ParameterMetadata> } {
	const combined = [
		...((Array.isArray(pathItem.parameters) ? pathItem.parameters : []) as unknown[]),
		...((Array.isArray(operation.parameters) ? operation.parameters : []) as unknown[])
	];
	const parameters: ToolParameter[] = [];
	const metadata: Record<string, ParameterMetadata> = {};

	for (const entry of combined) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const param = entry as Record<string, unknown>;
		const name = typeof param.name === 'string' ? param.name : null;
		const location = typeof param.in === 'string' ? param.in : null;
		if (!name || !location || !['path', 'query', 'header'].includes(location)) {
			continue;
		}
		const schema = param.schema as Record<string, unknown> | undefined;
		const type = mapSchemaType(schema);
		const descriptionText = typeof param.description === 'string'
			? param.description
			: 'No description provided.';
		parameters.push({
			name,
			type,
			description: `${descriptionText} (in: ${location})`,
			required: Boolean(param.required),
			enum: Array.isArray(schema?.enum) ? (schema?.enum as string[]) : undefined
		});
		metadata[name] = {
			location: location as ParameterLocation,
			required: Boolean(param.required)
		};
	}

	return { parameters, metadata };
}

function buildRequestBody(
	operation: Record<string, unknown>,
	metadata: Record<string, ParameterMetadata>
): ToolParameter[] {
	const requestBody = operation.requestBody as Record<string, unknown> | undefined;
	if (!requestBody) {
		return [];
	}

	const content = requestBody.content as Record<string, unknown> | undefined;
	const jsonContent = content?.['application/json'] as Record<string, unknown> | undefined;
	if (!jsonContent) {
		return [];
	}

	const schema = jsonContent.schema as Record<string, unknown> | undefined;
	const descriptionParts: string[] = [];
	if (typeof requestBody.description === 'string') {
		descriptionParts.push(requestBody.description);
	}
	descriptionParts.push('Provide a JSON object that matches the API schema.');
	if (schema) {
		descriptionParts.push(`Schema type: ${describeSchema(schema)}`);
	}

	const bodyParam: ToolParameter = {
		name: 'body',
		type: 'object',
		description: descriptionParts.join(' '),
		required: Boolean(requestBody.required)
	};
	metadata['body'] = {
		location: 'body',
		required: Boolean(requestBody.required)
	};

	return [bodyParam];
}

function buildDescription(operation: Record<string, unknown>, method: string, pathKey: string): string {
	const summary = typeof operation.summary === 'string' ? operation.summary : undefined;
	const description = typeof operation.description === 'string' ? operation.description : undefined;
	return summary || description || `${method.toUpperCase()} ${pathKey}`;
}

function buildOperationId(
	namespace: string,
	method: string,
	pathKey: string,
	operation: Record<string, unknown>,
	usedNames: Set<string>
): string {
	const explicitId = typeof operation.operationId === 'string' && operation.operationId.trim()
		? operation.operationId.trim()
		: null;
	let base = explicitId ?? `${method}_${pathKey}`;
	base = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	let candidate = `${namespace}_${base}`;
	let suffix = 1;
	while (usedNames.has(candidate)) {
		candidate = `${namespace}_${base}_${suffix++}`;
	}
	usedNames.add(candidate);
	return candidate;
}

function mapSchemaType(schema?: Record<string, unknown>): ToolParameter['type'] {
	const type = typeof schema?.type === 'string' ? schema?.type : 'string';
	if (type === 'integer' || type === 'number') {
		return 'number';
	}
	if (type === 'boolean') {
		return 'boolean';
	}
	if (type === 'array') {
		return 'array';
	}
	if (type === 'object') {
		return 'object';
	}
	return 'string';
}

function describeSchema(schema: Record<string, unknown>): string {
	const type = typeof schema.type === 'string' ? schema.type : 'object';
	if (type === 'object' && schema.properties && typeof schema.properties === 'object') {
		const keys = Object.keys(schema.properties as Record<string, unknown>);
		return `object{${keys.slice(0, 5).join(', ')}}`;
	}
	if (type === 'array' && schema.items && typeof schema.items === 'object') {
		const child = schema.items as Record<string, unknown>;
		return `array<${describeSchema(child)}>`;
	}
	return type;
}

// ---------------------------------------------------------------------------
// Exported pure function — ToolManager-free core shared by OpenApiToolLoader
// and OpenApiToolSource
// ---------------------------------------------------------------------------

/**
 * Load an OpenAPI spec for the given config and generate its HTTP tools.
 * This is the ToolManager-free core shared by the legacy OpenApiToolLoader
 * and the new OpenApiToolSource. Returns an empty list for a disabled config.
 */
export async function loadOpenApiTools(
	config: OpenApiToolConfig,
	fileSystem: IFileSystem,
	pluginDataPath: string,
	options?: ReloadOptions,
): Promise<Tool[]> {
	if (!config.id) {
		throw new Error('OpenAPI config is missing an id');
	}
	if (!config.enabled) {
		return [];
	}

	const specContent = await loadSpec(config, fileSystem, pluginDataPath, options);
	let parsedSpec: OpenApiDocumentLike;
	try {
		parsedSpec = JSON.parse(specContent) as OpenApiDocumentLike;
	} catch (_error) {
		throw new Error('Failed to parse OpenAPI JSON specification');
	}

	const baseUrl = config.baseUrl?.trim() || extractServerUrl(parsedSpec);
	if (!baseUrl) {
		throw new Error(
			'Unable to determine base URL. Provide a Base URL override or add a server entry in the spec.',
		);
	}

	const namespace = sanitizeNamespace(config.name || config.id);
	const providerId = `openapi:${config.id}`;
	const auth: AuthConfig = {
		type: config.authType ?? 'none',
		key: config.authKey?.trim() || undefined,
		value: config.authValue?.trim() || undefined,
	};

	return generateTools(parsedSpec, baseUrl, providerId, namespace, auth);
}

// ---------------------------------------------------------------------------
// OpenApiToolLoader class — maintains ToolManager integration
// ---------------------------------------------------------------------------

export class OpenApiToolLoader {
	private providerMap = new Map<string, string>();

	constructor(
		private readonly fileSystem: IFileSystem,
		private readonly toolManager: ToolManager,
		private readonly pluginDataPath: string
	) {}

	async reloadAll(configs: OpenApiToolConfig[], options?: ReloadOptions): Promise<Map<string, number>> {
		const results = new Map<string, number>();
		const seen = new Set<string>();

		for (const config of configs) {
			if (!config.id) {
				continue;
			}
			const count = await this.reloadConfig(config, options);
			results.set(config.id, count);
			seen.add(config.id);
		}

		for (const [configId, providerId] of this.providerMap.entries()) {
			if (!seen.has(configId)) {
				this.toolManager.removeToolsByProvider(providerId);
				this.providerMap.delete(configId);
			}
		}

		return results;
	}

	async reloadConfig(config: OpenApiToolConfig, options?: ReloadOptions): Promise<number> {
		if (!config.id) {
			throw new Error('OpenAPI config is missing an id');
		}

		const previousProvider = this.providerMap.get(config.id);
		if (previousProvider) {
			this.toolManager.removeToolsByProvider(previousProvider);
			this.providerMap.delete(config.id);
		}

		const tools = await loadOpenApiTools(config, this.fileSystem, this.pluginDataPath, options);
		if (tools.length === 0) {
			return 0;
		}

		for (const tool of tools) {
			this.toolManager.registerTool(tool);
			this.toolManager.enableTool(tool.definition.name);
		}

		const providerId = `openapi:${config.id}`;
		this.providerMap.set(config.id, providerId);
		return tools.length;
	}

	async removeConfig(configId: string): Promise<void> {
		await Promise.resolve();
		const providerId = this.providerMap.get(configId);
		if (providerId) {
			this.toolManager.removeToolsByProvider(providerId);
			this.providerMap.delete(configId);
		}
	}
}
