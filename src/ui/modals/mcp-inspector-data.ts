import type { ToolRegistry } from '@/features/tools/tool-registry';
import type { RegisteredTool } from '@/features/tools/types/tools';

/** Names of MCP servers that currently have tools loaded in the registry. */
export function getConnectedMcpServers(registry: ToolRegistry): string[] {
	const seen = new Set<string>();
	for (const tool of registry.getTools()) {
		if (tool.origin.kind === 'mcp') {
			seen.add(tool.origin.sourceId);
		}
	}
	return [...seen];
}

/** Group all registered tools by `${origin.kind}:${origin.sourceId}` for the inspector UI. */
export function getToolsByProviderKey(registry: ToolRegistry): Map<string, RegisteredTool[]> {
	const map = new Map<string, RegisteredTool[]>();
	for (const tool of registry.getTools()) {
		const key = `${tool.origin.kind}:${tool.origin.sourceId}`;
		const bucket = map.get(key);
		if (bucket) {
			bucket.push(tool);
		} else {
			map.set(key, [tool]);
		}
	}
	return map;
}
