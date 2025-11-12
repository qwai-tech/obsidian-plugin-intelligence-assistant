import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ChildProcess, spawn } from 'child_process';
import type { MCPServerConfig } from '@/types';

export interface MCPTool {
	name: string;
	description?: string;
	inputSchema: {
		type: 'object';
		properties?: Record<string, any>;
		required?: string[];
	};
}

export class MCPClient {
	private client: Client;
	private transport: StdioClientTransport;
	private process: ChildProcess | null = null;
	private connected: boolean = false;

	constructor(private config: MCPServerConfig) {
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
			let command = this.config.command;
			if (command === 'npx' || command === 'npm' || command === 'node' || command === 'uvx' || command === 'python' || command === 'python3') {
				command = await this.resolveCommandPath(command);
			}

			// Spawn the MCP server process
			this.process = spawn(command, this.config.args || [], {
				env: { ...process.env, ...this.config.env },
			});

			// Create stdio transport
			this.transport = new StdioClientTransport({
				command: command,
				args: this.config.args || [],
				env: this.config.env,
			});

			// Connect the client
			await this.client.connect(this.transport);
			this.connected = true;

			console.log(`[MCP] Connected to server: ${this.config.name}`);
		} catch (error) {
			console.error(`[MCP] Failed to connect to ${this.config.name}:`, error);
			throw error;
		}
	}

	private async resolveCommandPath(command: string): Promise<string> {
		// Try common paths first
		const commonPaths = [
			`/usr/local/bin/${command}`,
			`/opt/homebrew/bin/${command}`,
			`${process.env.HOME}/.nvm/current/bin/${command}`, // Node/npm
			`${process.env.HOME}/.local/bin/${command}`, // Python user install
			`${process.env.HOME}/.cargo/bin/${command}`, // Rust/cargo (uv is often installed via cargo)
			`/usr/bin/${command}`,
		];

		const { exec } = require('child_process');
		const { promisify } = require('util');
		const execPromise = promisify(exec);

		// Try to use 'which' command to find the executable
		try {
			const { stdout } = await execPromise(`which ${command}`);
			const path = stdout.trim();
			if (path) {
				console.log(`[MCP] Resolved ${command} to ${path}`);
				return path;
			}
		} catch (error) {
			// 'which' failed, try common paths
		}

		// Check common paths
		const fs = require('fs');
		for (const path of commonPaths) {
			try {
				await fs.promises.access(path, fs.constants.X_OK);
				console.log(`[MCP] Resolved ${command} to ${path}`);
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
			console.log(`[MCP] Disconnected from server: ${this.config.name}`);
		} catch (error) {
			console.error(`[MCP] Error disconnecting from ${this.config.name}:`, error);
		}
	}

	async listTools(): Promise<MCPTool[]> {
		if (!this.connected) {
			throw new Error('Not connected to MCP server');
		}

		try {
			const response = await this.client.listTools();
			return response.tools.map((tool: any) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			}));
		} catch (error) {
			console.error(`[MCP] Failed to list tools from ${this.config.name}:`, error);
			throw error;
		}
	}

	async callTool(name: string, args: Record<string, any>): Promise<any> {
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
				throw new Error(`Tool execution error: ${JSON.stringify(response.content)}`);
			}

			// Extract result from content array
			// MCP tools return content as an array of ContentBlock
			if (response.content && (response.content as any[]).length > 0) {
				const firstContent = (response.content as any[])[0];
				if (firstContent.type === 'text') {
					return firstContent.text;
				}
				return firstContent;
			}

			return response.structuredContent || response.content;
		} catch (error) {
			console.error(`[MCP] Failed to call tool ${name} on ${this.config.name}:`, error);
			throw error;
		}
	}

	isConnected(): boolean {
		return this.connected;
	}

	getServerName(): string {
		return this.config.name;
	}
}
