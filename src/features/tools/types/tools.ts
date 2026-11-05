/**
 * Tool Common Types
 * Shared types for tool system
 */
import type { ZodMiniObject, ZodMiniType } from 'zod/mini';

export interface ToolParameter {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description: string;
	required?: boolean;
	enum?: string[];
	schema?: Record<string, unknown>;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameter[];
	inputSchema?: ToolInputSchema;
	sideEffects?: ToolSideEffects;
	/** Trusted source contract; not inferred from model prose or tool output. */
	argumentSources?: ArgumentSourceRule[];
}

export interface ArgumentSourceRule {
	argument: string;
	when?: Record<string, string | number | boolean>;
	/** Omit to use this same bound tool; otherwise use its enabled LLM name. */
	sourceTool?: string;
	sourceWhen?: Record<string, string | number | boolean>;
	/** Current argument -> source-call argument. All must match exactly. */
	match: Record<string, string>;
	/** Own-property path in the successful structured result. JSON strings are decoded. */
	outputPath: string[];
	/** By default dispatch consumes the observation, including uncertain failures. */
	consume?: boolean;
}

export interface ToolSideEffects {
	vaultWrite?: boolean;
	externalWrite?: boolean;
	process?: boolean;
}

export interface ToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface ToolExecutionContext {
	signal?: AbortSignal;
}

export interface ToolResult {
	success: boolean;
	result?: unknown;
	error?: string;
}

export interface Tool {
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>, _context?: ToolExecutionContext): Promise<ToolResult>;
	provider?: string;
}

export interface BuiltInToolConfig {
	type: string;
	enabled: boolean;
}

/**
 * The kind of a tool source. builtin/mcp/openapi/cli are merely the
 * "first batch" of sources - the registry never special-cases them.
 */
export type ToolSourceKind = 'builtin' | 'mcp' | 'openapi' | 'cli';

/**
 * Structured identity of a tool's source, replacing the old `provider`
 * string tag. sourceId: builtin -> 'builtin'; mcp -> server name;
 * openapi/cli -> config.id
 */
export interface ToolOrigin {
	kind: ToolSourceKind;
	sourceId: string;
}

/**
 * A raw tool as produced by ToolSource.load() - without origin / toolId / llmName yet.
 *
 * Shaped like the existing `Tool` interface minus the `provider` field: the
 * `provider` string tag is replaced by the structured `ToolOrigin`, which the
 * ToolRegistry injects during aggregation, so tools emitted by a source carry
 * no origin info. Phase 2 ToolSource implementations emit SourceTool directly.
 */
export interface SourceTool {
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>, _context?: ToolExecutionContext): Promise<ToolResult>;
}

/**
 * A tool after the ToolRegistry has aggregated and disambiguated it.
 * - toolId: globally unique internal key = `${kind}:${sourceId}:${rawName}`
 * - llmName: the LLM-facing name, deterministically de-duplicated on collision
 */
export interface RegisteredTool {
	toolId: string;
	llmName: string;
	origin: ToolOrigin;
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>, _context?: ToolExecutionContext): Promise<ToolResult>;
}

/**
 * Per-agent tool access configuration.
 * key = `${kind}:${sourceId}` (one source);
 * value = 'all' (every tool of that source) or a list of toolIds.
 */
export interface AgentToolAccess {
	sources: Record<string, 'all' | string[]>;
}

export type ToolInputSchema = ZodMiniObject<Record<string, ZodMiniType>>;
