import spawn from 'cross-spawn';
import type { ChildProcessWithoutNullStreams } from 'child_process';

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface McpLaunch {
	command: string;
	args: string[];
	env: Record<string, string>;
}

interface JsonRpcMessage {
	id?: number | string;
	method?: string;
	result?: unknown;
	error?: { code: number; message: string };
}

interface PendingRequest {
	resolve(value: unknown): void;
	reject(error: Error): void;
	timer: number;
}

export class McpStdioSession {
	private nextId = 1;
	private buffer = '';
	private closed = false;
	private readonly pending = new Map<number, PendingRequest>();

	private constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly requestTimeoutMs: number) {
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => this.receive(chunk));
		child.stderr.resume();
		child.stdin.on('error', (error) => this.fail(error));
		child.on('error', (error) => this.fail(error));
		child.on('exit', (code) => this.fail(new Error(`MCP server exited with code ${code ?? 'unknown'}`)));
	}

	static async open(launch: McpLaunch, clientInfo: { name: string; version: string }, options: { requestTimeoutMs?: number } = {}): Promise<McpStdioSession> {
		const child = spawn(launch.command, launch.args, { env: launch.env, stdio: 'pipe' });
		const session = new McpStdioSession(child, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
		try {
			await session.request('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo });
		} catch (error) {
			await session.close();
			throw error;
		}
		session.send({ method: 'notifications/initialized' });
		return session;
	}

	request(method: string, params: Record<string, unknown>): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error('MCP session is closed'));
		}
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request ${method} timed out after ${this.requestTimeoutMs} ms`));
			}, this.requestTimeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			this.send({ id, method, params });
		});
	}

	close(): Promise<void> {
		if (!this.closed) {
			this.fail(new Error('MCP session is closed'));
			this.child.kill();
		}
		return Promise.resolve();
	}

	private send(message: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: unknown }): void {
		if (this.child.stdin.writable) {
			this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
		}
	}

	private receive(chunk: string): void {
		this.buffer += chunk;
		let newline = this.buffer.indexOf('\n');
		while (newline !== -1) {
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			if (line) {
				this.handle(line);
			}
			newline = this.buffer.indexOf('\n');
		}
	}

	private handle(line: string): void {
		let message: JsonRpcMessage;
		try {
			message = JSON.parse(line) as JsonRpcMessage;
		} catch {
			return;
		}
		if (message.method && message.id !== undefined) {
			this.answerServerRequest(message.id, message.method);
			return;
		}
		const pending = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
		if (!pending || typeof message.id !== 'number') {
			return;
		}
		this.pending.delete(message.id);
		window.clearTimeout(pending.timer);
		if (message.error) {
			pending.reject(new Error(message.error.message));
		} else {
			pending.resolve(message.result);
		}
	}

	private answerServerRequest(id: number | string, method: string): void {
		if (method === 'ping') {
			this.send({ id, result: {} });
		} else {
			this.send({ id, error: { code: -32601, message: `Method not supported by client: ${method}` } });
		}
	}

	private fail(error: Error): void {
		this.closed = true;
		for (const [id, pending] of this.pending) {
			window.clearTimeout(pending.timer);
			pending.reject(error);
			this.pending.delete(id);
		}
	}
}
