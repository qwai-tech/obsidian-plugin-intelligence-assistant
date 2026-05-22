/**
 * Tool Common Types
 * Shared types for tool system
 */

export interface ToolParameter {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description: string;
	required?: boolean;
	enum?: string[];
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameter[];
}

export interface ToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface ToolResult {
	success: boolean;
	result?: unknown;
	error?: string;
}

export interface Tool {
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>): Promise<ToolResult>;
	provider?: string;
}

export interface BuiltInToolConfig {
	type: string;
	enabled: boolean;
}

/**
 * 工具来源的种类。builtin/mcp/openapi/cli 只是「第一批」来源,
 * registry 不对它们做任何特判。
 */
export type ToolSourceKind = 'builtin' | 'mcp' | 'openapi' | 'cli';

/**
 * 一个工具的结构化来源标识,取代旧的字符串 `provider` 标签。
 * sourceId:builtin → 'builtin';mcp → server 名;openapi/cli → config.id
 */
export interface ToolOrigin {
	kind: ToolSourceKind;
	sourceId: string;
}

/**
 * 由 ToolSource.load() 产出的原始工具 —— 还没有 origin / toolId / llmName。
 *
 * 形状等同于既有的 `Tool` 接口去掉 `provider` 字段:`provider` 字符串标签
 * 已被结构化的 `ToolOrigin` 取代,由 ToolRegistry 在聚合时注入,因此 source
 * 自身产出的工具不携带来源信息。第 2 期各 ToolSource 实现直接产出 SourceTool。
 */
export interface SourceTool {
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 经 ToolRegistry 聚合、消歧后的工具。
 * - toolId:全局唯一内部键 = `${kind}:${sourceId}:${rawName}`
 * - llmName:LLM 可见名,冲突时确定性去重
 */
export interface RegisteredTool {
	toolId: string;
	llmName: string;
	origin: ToolOrigin;
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 单个 agent 的工具访问配置。
 * key = `${kind}:${sourceId}`(一个 source);
 * value = 'all'(该 source 全部工具)或一组 toolId。
 */
export interface AgentToolAccess {
	sources: Record<string, 'all' | string[]>;
}
