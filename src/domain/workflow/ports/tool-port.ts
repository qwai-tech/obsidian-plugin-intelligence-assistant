/**
 * Tool Port
 * Interface for tool execution in workflows
 */

import type { ToolCall, ToolResult } from '@/types';

export interface IToolPort {
	/**
	 * Execute a tool
	 */
	executeTool(_call: ToolCall): Promise<ToolResult>;

	/**
	 * Get available tools
	 */
	getAvailableTools(): Promise<string[]>;

	/**
	 * Check if tool is available
	 */
	isToolAvailable(_toolName: string): Promise<boolean>;
}
