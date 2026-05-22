/**
 * ToolSource - the unified interface for a tool source.
 * builtin / mcp / openapi / cli all implement it; the ToolRegistry treats them alike.
 */
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';

export interface ToolSource {
	/** Source kind */
	readonly kind: ToolSourceKind;
	/** Source instance id: builtin -> 'builtin'; mcp -> server name; openapi/cli -> config.id */
	readonly id: string;
	/** Display label */
	readonly label: string;
	/** Load this source's tools (MCP connect, OpenAPI spec fetch, builtin/cli sync construct) */
	load(): Promise<SourceTool[]>;
	/** Release resources (MCP disconnect; no-op otherwise) */
	dispose(): Promise<void>;
}
