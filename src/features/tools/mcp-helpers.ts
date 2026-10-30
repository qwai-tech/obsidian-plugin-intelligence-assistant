import type { CachedMCPTool } from '@/features/tools/types/mcp';
import type { RegisteredTool } from '@/features/tools/types/tools';
import { parametersToJsonSchema } from './tool-schema';

/**
 * Convert a registry tool list to the shape persisted in server.cachedTools.
 * Only the metadata that's needed for offline display is kept.
 */
export function snapshotMcpTools(tools: RegisteredTool[]): CachedMCPTool[] {
	return tools.map((tool) => ({
		name: tool.definition.name,
		description: tool.definition.description,
		inputSchema: parametersToJsonSchema(tool.definition.parameters),
	}));
}
