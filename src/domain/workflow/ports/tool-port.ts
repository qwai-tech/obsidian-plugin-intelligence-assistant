/**
 * Tool Port
 * Interface for tool execution in workflows
 */

import type { ToolCall, ToolResult } from '@/types';

export interface IToolPort {
	/**
	 * Execute a tool
	 */
	executeTool(call: ToolCall): Promise<ToolResult>;

	/**
	 * Get available tools
	 */
	getAvailableTools(): Promise<string[]>;

	/**
	 * Check if tool is available
	 */
	isToolAvailable(toolName: string): Promise<boolean>;
}
