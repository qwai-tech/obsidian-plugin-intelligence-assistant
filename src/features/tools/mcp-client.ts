import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs, constants as fsConstants } from 'fs';
import type { MCPServerConfig } from '@/features/tools/types/mcp';
import { buildSubprocessEnv } from '@/features/tools/subprocess-env';
import { McpStdioSession } from './mcp-stdio-session';

const CLIENT_INFO = { name: 'obsidian-intelligence-assistant', version: '1.0.0' };

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
	private session: McpStdioSession | null = null;
	private wanted = false;

	constructor(private _config: MCPServerConfig) {}

	async connect(): Promise<void> {
		this.wanted = true;
		if (this.session?.isOpen) {
			return;
		}
		this.session = null;

		try {
			// Resolve command path if needed (e.g., npx -> /usr/local/bin/npx)
			let command = this._config.command;
			if (command === 'npx' || command === 'npm' || command === 'node' || command === 'uvx' || command === 'python' || command === 'python3') {
				command = await this.resolveCommandPath(command);
			}

			// Create stdio transport with an allowlisted environment (avoids
			// leaking unrelated parent-process secrets into the MCP subprocess).
			const env = buildSubprocessEnv(this._config.env);
			this.session = await McpStdioSession.open({ command, args: this._config.args || [], env }, CLIENT_INFO);
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

		const execFilePromise = promisify(execFile);

		try {
			const { stdout } = await execFilePromise('which', [command]);
			const path = stdout.trim();
			if (path) {
				return path;
			}
		} catch {
			// 'which' failed, try common paths
		}

		// Check common paths
		for (const path of commonPaths) {
			try {
				await fs.access(path, fsConstants.X_OK);
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
			const [first] = Array.isArray(response.content) ? response.content as unknown[] : [];
			if (first) {
				return isTextBlock(first) ? first.text : first;
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

	private async liveSession(): Promise<McpStdioSession> {
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
