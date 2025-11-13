import { App } from 'obsidian';
import { Tool, ToolCall, ToolResult, ToolDefinition } from './types';
import { ReadFileTool, WriteFileTool, ListFilesTool } from './file-tools';
import { SearchFilesTool, CreateNoteTool, AppendToNoteTool } from './search-tools';
import { MCPClient, MCPTool } from './mcp-client';
import type { MCPServerConfig } from '@/types';
import { MCPToolWrapper } from './mcp-tool-wrapper';
import type { ToolConfig } from '@plugin';

export class ToolManager {
	private tools: Map<string, Tool> = new Map();
	private enabledTools: Set<string> = new Set();
	private mcpClients: Map<string, MCPClient> = new Map();

	constructor(private app: App, private toolConfigs?: ToolConfig[]) {
		this.registerDefaultTools();
		this.updateEnabledTools();
	}

	private registerDefaultTools() {
		// File operation tools
		this.registerTool(new ReadFileTool(this.app));
		this.registerTool(new WriteFileTool(this.app));
		this.registerTool(new ListFilesTool(this.app));

		// Search and note tools
		this.registerTool(new SearchFilesTool(this.app));
		this.registerTool(new CreateNoteTool(this.app));
		this.registerTool(new AppendToNoteTool(this.app));
	}

	private updateEnabledTools() {
		this.enabledTools.clear();
		if (this.toolConfigs) {
			for (const config of this.toolConfigs) {
				if (config.enabled) {
					this.enabledTools.add(config.type);
				}
			}
		} else {
			// If no config provided, enable all tools
			for (const tool of this.tools.values()) {
				this.enabledTools.add(tool.definition.name);
			}
		}
	}

	setToolConfigs(configs: ToolConfig[]) {
		this.toolConfigs = configs;
		this.updateEnabledTools();
	}

	registerTool(tool: Tool) {
		// Add provider tag to built-in tools if not set
		if (!tool.provider) {
			tool.provider = 'built-in';
		}
		this.tools.set(tool.definition.name, tool);
	}

	/**
	 * Register an MCP server and load its tools
	 */
	async registerMCPServer(config: MCPServerConfig): Promise<MCPTool[]> {
		if (!config.enabled) {
			console.debug(`[MCP] Server ${config.name} is disabled, skipping`);
			return [];
		}

		if (this.mcpClients.has(config.name)) {
			console.debug(`[MCP] Server ${config.name} already registered, skipping duplicate connect`);
			return [];
		}

		try {
			const client = new MCPClient(config);
			await client.connect();

			// Load tools from the MCP server
			const mcpTools = await client.listTools();
			console.debug(`[MCP] Loaded ${mcpTools.length} tools from ${config.name}`);

			// Wrap and register each tool
			for (const mcpTool of mcpTools) {
				const wrapper = new MCPToolWrapper(mcpTool, client);
				this.registerTool(wrapper);

				// Auto-enable MCP tools
				this.enabledTools.add(wrapper.definition.name);
			}

			// Store the client for later use
			this.mcpClients.set(config.name, client);
			return mcpTools;
		} catch (error) {
			console.error(`[MCP] Failed to register server ${config.name}:`, error);
			throw error;
		}
	}


	/**
	 * Unregister an MCP server and remove its tools
	 */
	async unregisterMCPServer(serverName: string): Promise<void> {
		const client = this.mcpClients.get(serverName);
		if (!client) {
			return;
		}

		// Remove all tools from this server
		const toolsToRemove = Array.from(this.tools.entries())
			.filter(([_, tool]) => tool.provider === `mcp:${serverName}`)
			.map(([name, _]) => name);

		for (const toolName of toolsToRemove) {
			this.tools.delete(toolName);
			this.enabledTools.delete(toolName);
		}

		// Disconnect and remove client
		await client.disconnect();
		this.mcpClients.delete(serverName);

		console.debug(`[MCP] Unregistered server ${serverName} and removed ${toolsToRemove.length} tools`);
	}

	/**
	 * Get all MCP server names
	 */
	getMCPServers(): string[] {
		return Array.from(this.mcpClients.keys());
	}

	/**
	 * Get tools grouped by provider
	 */
	getToolsByProvider(): Map<string, Tool[]> {
		const byProvider = new Map<string, Tool[]>();

		for (const tool of this.tools.values()) {
			const provider = tool.provider || 'built-in';
			if (!byProvider.has(provider)) {
				byProvider.set(provider, []);
			}
			byProvider.get(provider)!.push(tool);
		}

		return byProvider;
	}

	getTool(name: string): Tool | undefined {
		return this.tools.get(name);
	}

	getAllTools(): Tool[] {
		return Array.from(this.tools.values()).filter(tool =>
			this.enabledTools.has(tool.definition.name)
		);
	}

	getToolDefinitions(): ToolDefinition[] {
		return this.getAllTools().map(t => t.definition);
	}

	isToolEnabled(toolName: string): boolean {
		return this.enabledTools.has(toolName);
	}

	async executeTool(call: ToolCall): Promise<ToolResult> {
		const tool = this.getTool(call.name);
		if (!tool) {
			return {
				success: false,
				error: `Tool not found: ${call.name}`
			};
		}

		// Check if tool is enabled
		if (!this.isToolEnabled(call.name)) {
			return {
				success: false,
				error: `Tool is disabled: ${call.name}`
			};
		}

		try {
			return await tool.execute(call.arguments);
		} catch (error) {
			return {
				success: false,
				error: `Tool execution failed: ${error.message}`
			};
		}
	}

	// Convert tool definitions to OpenAI function calling format
	toOpenAIFunctions(): any[] {
		return this.getAllTools().map(tool => ({
			name: tool.definition.name,
			description: tool.definition.description,
			parameters: {
				type: 'object',
				properties: tool.definition.parameters.reduce((acc, param) => {
					acc[param.name] = {
						type: param.type,
						description: param.description,
						...(param.enum ? { enum: param.enum } : {})
					};
					return acc;
				}, {} as Record<string, any>),
				required: tool.definition.parameters
					.filter(p => p.required)
					.map(p => p.name)
			}
		}));
	}

	// Convert tool definitions to Anthropic tools format
	toAnthropicTools(): any[] {
		return this.getAllTools().map(tool => ({
			name: tool.definition.name,
			description: tool.definition.description,
			input_schema: {
				type: 'object',
				properties: tool.definition.parameters.reduce((acc, param) => {
					acc[param.name] = {
						type: param.type,
						description: param.description,
						...(param.enum ? { enum: param.enum } : {})
					};
					return acc;
				}, {} as Record<string, any>),
				required: tool.definition.parameters
					.filter(p => p.required)
					.map(p => p.name)
			}
		}));
	}

	/**
	 * Cleanup - disconnect all MCP clients
	 */
	async cleanup(): Promise<void> {
		const disconnectPromises = Array.from(this.mcpClients.values()).map(client =>
			client.disconnect().catch(err => console.error('[MCP] Error disconnecting:', err))
		);
		await Promise.all(disconnectPromises);
		this.mcpClients.clear();
		console.debug('[MCP] All MCP clients disconnected');
	}
}
