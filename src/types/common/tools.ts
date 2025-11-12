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
	arguments: Record<string, any>;
}

export interface ToolResult {
	success: boolean;
	result?: any;
	error?: string;
}

export interface Tool {
	definition: ToolDefinition;
	execute(args: Record<string, any>): Promise<ToolResult>;
	provider?: string;
}

export interface BuiltInToolConfig {
	type: string;
	enabled: boolean;
}
