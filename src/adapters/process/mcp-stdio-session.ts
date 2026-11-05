import { runtimeClock } from '@qwai/obsidian-llm';
import spawn from 'cross-spawn';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { McpConnection, ProcessLaunch } from '@/features/tools';

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const KILL_GRACE_MS = 3_000;


interface JsonRpcMessage {
	id?: number | string;
	method?: string;
	result?: unknown;
	error?: { code: number; message: string };
}

interface PendingRequest {
	resolve(value: unknown): void;
	reject(error: Error): void;
	timer: ReturnType<typeof runtimeClock.schedule>;
	cleanup(): void;
}

export class McpStdioSession implements McpConnection {
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

	static async open(launch: ProcessLaunch, clientInfo: { name: string; version: string }, options: { requestTimeoutMs?: number } = {}): Promise<McpStdioSession> {
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

	request(method: string, params: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error('MCP session is closed'));
		}
		if (options.signal?.aborted) return Promise.reject(options.signal.reason instanceof Error ? options.signal.reason : new Error('MCP request aborted'));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const cancel = (reason: Error) => {
				const pending = this.pending.get(id);
				if (!pending) return;
				this.pending.delete(id);
				pending.cleanup();
				if (method !== 'initialize') this.send({ method: 'notifications/cancelled', params: { requestId: id, reason: reason.message } });
				reject(reason);
			};
			const abort = () => cancel(new Error(`MCP request ${method} aborted`));
			const timer = runtimeClock.schedule(() => cancel(new Error(`MCP request ${method} timed out after ${this.requestTimeoutMs} ms`)), this.requestTimeoutMs);
			const cleanup = () => { runtimeClock.cancel(timer); options.signal?.removeEventListener('abort', abort); };
			this.pending.set(id, { resolve, reject, timer, cleanup });
			options.signal?.addEventListener('abort', abort, { once: true });
			this.send({ id, method, params });
			if (options.signal?.aborted) abort();
		});
	}

	get isOpen(): boolean {
		return !this.closed;
	}

	async close(): Promise<void> {
		if (!this.closed) {
			this.fail(new Error('MCP session is closed'));
		}
		if (this.child.exitCode !== null || this.child.signalCode !== null) {
			return;
		}
		const exited = new Promise<void>((resolve) => this.child.once('close', () => resolve()));
		this.child.kill();
		const forceKill = runtimeClock.schedule(() => this.child.kill('SIGKILL'), KILL_GRACE_MS);
		await exited;
		runtimeClock.cancel(forceKill);
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
		pending.cleanup();
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
			pending.cleanup();
			pending.reject(error);
			this.pending.delete(id);
		}
	}
}
