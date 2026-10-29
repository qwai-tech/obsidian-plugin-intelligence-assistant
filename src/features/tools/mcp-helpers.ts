import type { CachedMCPTool } from '@/features/tools/types/mcp';
import type { RegisteredTool } from '@/features/tools/types/tools';

/**
 * Convert a registry tool list to the shape persisted in server.cachedTools.
 * Only the metadata that's needed for offline display is kept.
 */
export function snapshotMcpTools(tools: RegisteredTool[]): CachedMCPTool[] {
	return tools.map((tool) => ({
		name: tool.definition.name,
		description: tool.definition.description,
		inputSchema: extractInputSchema(tool),
	}));
}

/** RegisteredTool doesn't carry a raw JSON-schema input shape, so we reassemble it. */
function extractInputSchema(tool: RegisteredTool): CachedMCPTool['inputSchema'] {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const param of tool.definition.parameters) {
		properties[param.name] = {
			type: param.type,
			description: param.description,
			...(param.enum ? { enum: param.enum } : {}),
		};
		if (param.required) required.push(param.name);
	}
	return { type: 'object', properties, required };
}
