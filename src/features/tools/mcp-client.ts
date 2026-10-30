import type { MCPServerConfig } from '@/features/tools/types/mcp';
import { buildSubprocessEnv } from '@/features/tools/subprocess-env';
import type { McpConnection, McpConnector } from './process-ports';

export interface MCPTool {
	name: string;
	description?: string;
	inputSchema: {
		type: 'object';
		properties?: Record<string, unknown>;
		required?: string[];
	};
}

export class MCPClient {
	private session: McpConnection | null = null;
	private wanted = false;

	constructor(private _config: MCPServerConfig, private readonly connector: McpConnector) {}

	async connect(): Promise<void> {
		this.wanted = true;
		if (this.session?.isOpen) {
			return;
		}
		this.session = null;

		try {
			this.session = await this.connector({ command: this._config.command, args: this._config.args || [], env: buildSubprocessEnv(this._config.env) });
		} catch (error) {
			console.error(`[MCP] Failed to connect to ${this._config.name}:`, error);
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		this.wanted = false;
		const session = this.session;
		this.session = null;
		await session?.close();
	}

	async listTools(): Promise<MCPTool[]> {
		const session = await this.liveSession();
		try {
			const tools: MCPTool[] = [];
			let cursor: string | undefined;
			do {
				const page = await session.request('tools/list', cursor ? { cursor } : {}) as { tools?: MCPTool[]; nextCursor?: string };
				tools.push(...(page.tools ?? []).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
				cursor = page.nextCursor;
			} while (cursor);
			return tools;
		} catch (error) {
			console.error(`[MCP] Failed to list tools from ${this._config.name}:`, error);
			throw error;
		}
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		const session = await this.liveSession();
		try {
			const response = await session.request('tools/call', { name, arguments: args }) as { isError?: boolean; content?: unknown; structuredContent?: unknown };
			if (response.isError) {
				throw new Error(`Tool execution error: ${JSON.stringify(response.content)}`);
			}
			const blocks = Array.isArray(response.content) ? response.content as unknown[] : [];
			if (blocks.length > 0) {
				return blocks.every(isTextBlock) ? blocks.map((block) => block.text).join('\n') : blocks;
			}
			return response.structuredContent ?? response.content;
		} catch (error) {
			console.error(`[MCP] Failed to call tool ${name} on ${this._config.name}:`, error);
			throw error;
		}
	}

	isConnected(): boolean {
		return this.session?.isOpen ?? false;
	}

	private async liveSession(): Promise<McpConnection> {
		if (!this.wanted) {
			throw new Error('Not connected to MCP server');
		}
		await this.connect();
		if (!this.session) {
			throw new Error('Not connected to MCP server');
		}
		return this.session;
	}

	getServerName(): string {
		return this._config.name;
	}
}

function isTextBlock(block: unknown): block is { type: 'text'; text: string } {
	return typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string';
}
