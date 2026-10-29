import type { HttpPort } from '@qwai/obsidian-llm';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';
import type { Tool, ToolDefinition, ToolParameter } from '@/features/tools/types/tools';
import { createToolDefinition } from '@/features/tools/tool-schema';
import { OpenApiOperationTool, type AuthConfig, type HttpMethod, type OpenApiDocumentLike, type ParameterLocation, type ParameterMetadata } from './openapi-operation-tool';
import { loadSpec, type OpenApiLoadContext } from './openapi-spec-loader';

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
	auth: AuthConfig,
	http: HttpPort,
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
			const definition: ToolDefinition = createToolDefinition({
				name: operationId,
				description,
				parameters: [...parameters, ...requestBody],
				sideEffects: ['post', 'put', 'delete', 'patch'].includes(method) ? { externalWrite: true } : undefined,
			});
			const tool = new OpenApiOperationTool(definition, method, pathKey, baseUrl, metadata, providerId, auth, http);
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
// loadOpenApiTools — pure function used by OpenApiToolSource.
// ---------------------------------------------------------------------------

/**
 * Load an OpenAPI spec for the given config and generate its HTTP tools.
 * Returns an empty list for a disabled config.
 */
export async function loadOpenApiTools(config: OpenApiToolConfig, context: OpenApiLoadContext): Promise<Tool[]> {
	if (!config.id) {
		throw new Error('OpenAPI config is missing an id');
	}
	if (!config.enabled) {
		return [];
	}

	const specContent = await loadSpec(config, context);
	let parsedSpec: OpenApiDocumentLike;
	try {
		parsedSpec = JSON.parse(specContent) as OpenApiDocumentLike;
	} catch {
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

	return generateTools(parsedSpec, baseUrl, providerId, namespace, auth, context.http);
}

