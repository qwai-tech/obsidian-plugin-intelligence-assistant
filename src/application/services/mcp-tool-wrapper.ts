import { Tool, ToolDefinition, ToolParameter, ToolResult } from './types';
import { MCPClient, MCPTool } from './mcp-client';

/**
 * Wraps an MCP tool to adapt it to our internal Tool interface
 */
export class MCPToolWrapper implements Tool {
	definition: ToolDefinition;
	provider: string;

	constructor(
		private mcpTool: MCPTool,
		private mcpClient: MCPClient
	) {
		this.provider = `mcp:${mcpClient.getServerName()}`;
		this.definition = this.convertMCPToolToDefinition(mcpTool);
	}

	/**
	 * Convert MCP tool schema to our internal ToolDefinition format
	 */
	private convertMCPToolToDefinition(mcpTool: MCPTool): ToolDefinition {
		const parameters: ToolParameter[] = [];

		if (mcpTool.inputSchema?.properties) {
			const required = new Set(mcpTool.inputSchema.required || []);

			for (const [name, schema] of Object.entries(mcpTool.inputSchema.properties)) {
				const paramSchema = schema as any;

				parameters.push({
					name,
					type: this.mapJsonSchemaType(paramSchema.type),
					description: paramSchema.description || '',
					required: required.has(name),
					enum: paramSchema.enum,
				});
			}
		}

		return {
			name: mcpTool.name,
			description: mcpTool.description || '',
			parameters,
		};
	}

	/**
	 * Map JSON Schema types to our internal types
	 */
	private mapJsonSchemaType(jsonSchemaType: string): 'string' | 'number' | 'boolean' | 'array' | 'object' {
		switch (jsonSchemaType) {
			case 'string':
				return 'string';
			case 'number':
			case 'integer':
				return 'number';
			case 'boolean':
				return 'boolean';
			case 'array':
				return 'array';
			case 'object':
				return 'object';
			default:
				return 'string';
		}
	}

	/**
	 * Execute the MCP tool
	 */
	async execute(args: Record<string, any>): Promise<ToolResult> {
		try {
			if (!this.mcpClient.isConnected()) {
				return {
					success: false,
					error: `MCP server ${this.mcpClient.getServerName()} is not connected`,
				};
			}

			const result = await this.mcpClient.callTool(this.mcpTool.name, args);

			return {
				success: true,
				result,
			};
		} catch (error: any) {
			return {
				success: false,
				error: error.message || 'Unknown error calling MCP tool',
			};
		}
	}
}
