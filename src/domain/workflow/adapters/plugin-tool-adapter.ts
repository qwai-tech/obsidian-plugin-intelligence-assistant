/**
 * Plugin Tool Adapter
 * Implements tool port using plugin tool manager
 */

import type { IToolPort } from '../ports/tool-port';
import type { ToolCall, ToolResult } from '@/types';
import { ToolManager } from '@/application/services/tool-manager';

export class PluginToolAdapter implements IToolPort {
	constructor(private toolManager: ToolManager) {}

	async executeTool(call: ToolCall): Promise<ToolResult> {
		return await this.toolManager.executeTool(call);
	}

	async getAvailableTools(): Promise<string[]> {
		const tools = this.toolManager.getAllTools();
		return tools.map(t => t.definition.name);
	}

	async isToolAvailable(toolName: string): Promise<boolean> {
		return this.toolManager.isToolEnabled(toolName);
	}
}
