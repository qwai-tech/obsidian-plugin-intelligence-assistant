import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ChildProcess, spawn, exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import type { MCPServerConfig } from '@/types';

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
	private client: Client;
	private transport: StdioClientTransport;
	private process: ChildProcess | null = null;
	private connected: boolean = false;

	constructor(private _config: MCPServerConfig) {
		this.client = new Client(
			{
				name: 'obsidian-intelligence-assistant',
				version: '0.0.1',
			},
			{
				capabilities: {
					tools: {},
				},
			}
		);
	}

	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		try {
			// Resolve command path if needed (e.g., npx -> /usr/local/bin/npx)
			let command = this._config.command;
			if (command === 'npx' || command === 'npm' || command === 'node' || command === 'uvx' || command === 'python' || command === 'python3') {
				command = await this.resolveCommandPath(command);
			}

			// Spawn the MCP server process
			this.process = spawn(command, this._config.args || [], {
				env: { ...process.env, ...this._config.env },
			});

			// Create stdio transport
			this.transport = new StdioClientTransport({
				command: command,
				args: this._config.args || [],
				env: this._config.env,
			});

			// Connect the client
			await this.client.connect(this.transport);
			this.connected = true;

			console.debug(`[MCP] Connected to server: ${this._config.name}`);
		} catch (error) {
			console.error(`[MCP] Failed to connect to ${this._config.name}:`, error);
			throw error;
		}
	}

	private async resolveCommandPath(command: string): Promise<string> {
		// Try common paths first
		const homeDir = process.env.HOME ?? '';
		const commonPaths = [
			`/usr/local/bin/${command}`,
			`/opt/homebrew/bin/${command}`,
			`${homeDir}/.nvm/current/bin/${command}`, // Node/npm
			`${homeDir}/.local/bin/${command}`, // Python user install
			`${homeDir}/.cargo/bin/${command}`, // Rust/cargo (uv is often installed via cargo)
			`/usr/bin/${command}`,
		];

		const execPromise = promisify(exec);

		// Try to use 'which' command to find the executable
		try {
			const { stdout } = await execPromise(`which ${command}`);
			const path = stdout.trim();
			if (path) {
				console.debug(`[MCP] Resolved ${command} to ${path}`);
				return path;
			}
		} catch {
			// 'which' failed, try common paths
		}

		// Check common paths
		for (const path of commonPaths) {
			try {
				await fs.access(path, fs.constants.X_OK);
				console.debug(`[MCP] Resolved ${command} to ${path}`);
				return path;
			} catch {
				// Path doesn't exist or isn't executable
			}
		}

		// If all else fails, return original command
		console.warn(`[MCP] Could not resolve path for ${command}, using original`);
		return command;
	}

	async disconnect(): Promise<void> {
		if (!this.connected) {
			return;
		}

		try {
			await this.client.close();
			if (this.process) {
				this.process.kill();
				this.process = null;
			}
			this.connected = false;
			console.debug(`[MCP] Disconnected from server: ${this._config.name}`);
		} catch (error) {
			console.error(`[MCP] Error disconnecting from ${this._config.name}:`, error);
		}
	}

	async listTools(): Promise<MCPTool[]> {
		if (!this.connected) {
			throw new Error('Not connected to MCP server');
		}

		try {
			const response = await this.client.listTools();
			return response.tools.map((tool: { name: string; description?: string; inputSchema: unknown }) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema as MCPTool['inputSchema'],
			}));
		} catch (error) {
			console.error(`[MCP] Failed to list tools from ${this._config.name}:`, error);
			throw error;
		}
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		if (!this.connected) {
			throw new Error('Not connected to MCP server');
		}

		try {
			const response = await this.client.callTool({
				name,
				arguments: args,
			});

			// Check if the tool returned an error
			if (response.isError) {
				throw new Error(`Tool execution error: ${JSON.stringify((response as {content: unknown}).content)}`);
			}

			// Extract result from content array
			// MCP tools return content as an array of ContentBlock
			if (response.content && Array.isArray(response.content as unknown[]) && (response as {content: unknown[]}).content.length > 0) {
				const firstContent = (response as {content: unknown[]}).content[0];
				if (firstContent && typeof firstContent === 'object' && 'type' in firstContent && (firstContent as {type: string}).type === 'text' && 'text' in firstContent) {
					return (firstContent as { text: string }).text;
				}
				return firstContent;
			}

			return (response as {structuredContent?: unknown, content?: unknown}).structuredContent || (response as {content?: unknown}).content;
		} catch (error) {
			console.error(`[MCP] Failed to call tool ${name} on ${this._config.name}:`, error);
			throw error;
		}
	}

	isConnected(): boolean {
		return this.connected;
	}

	getServerName(): string {
		return this._config.name;
	}
}
