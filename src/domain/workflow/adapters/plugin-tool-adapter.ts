/**
 * Plugin Tool Adapter
 * Implements tool port using plugin tool manager
 */

import type { IToolPort } from '../ports/tool-port';
import type { ToolCall, ToolResult } from '@/types';
import { ToolManager } from '@/application/services/tool-manager';

export class PluginToolAdapter implements IToolPort {
	constructor(private readonly _toolManager: ToolManager) {}

	async executeTool(call: ToolCall): Promise<ToolResult> {
		return await this._toolManager.executeTool(call);
	}

	getAvailableTools(): Promise<string[]> {
		const tools = this._toolManager.getAllTools();
		return Promise.resolve(tools.map(t => t.definition.name));
	}

	isToolAvailable(toolName: string): Promise<boolean> {
		return Promise.resolve(this._toolManager.isToolEnabled(toolName));
	}
}
