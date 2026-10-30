import * as path from 'node:path';
import { McpStdioSession } from '@/adapters/process/mcp-stdio-session';

const MOCK_SERVER = path.resolve('tests/e2e/support/mock-mcp-server.js');
const CLIENT = { name: 'test-client', version: '1.0.0' };

describe('McpStdioSession', () => {
	let session: McpStdioSession | null = null;

	afterEach(async () => {
		await session?.close();
		session = null;
	});

	it('initializes, lists tools and calls one over stdio JSON-RPC', async () => {
		session = await McpStdioSession.open({ command: process.execPath, args: [MOCK_SERVER], env: process.env as Record<string, string> }, CLIENT);

		const listed = await session.request('tools/list', {}) as { tools: Array<{ name: string }> };
		const called = await session.request('tools/call', { name: 'vault_echo', arguments: { text: 'hi' } }) as { content: Array<{ text: string }> };

		expect(listed.tools.map(tool => tool.name)).toEqual(['vault_echo']);
		expect(called.content[0].text).toBe('MCP_SENTINEL hi');
	});

	it('close resolves only once the server process has exited', async () => {
		const childPids = () => new Set((process as unknown as { _getActiveHandles(): Array<{ constructor: { name: string }; pid?: number }> })._getActiveHandles()
			.filter(handle => handle.constructor.name === 'ChildProcess')
			.map(handle => handle.pid));
		const before = childPids();
		const opened = await McpStdioSession.open({ command: process.execPath, args: [MOCK_SERVER], env: process.env as Record<string, string> }, CLIENT);
		const [serverPid] = [...childPids()].filter(pid => !before.has(pid));

		await opened.close();

		expect(serverPid).toEqual(expect.any(Number));
		expect(() => process.kill(serverPid as number, 0)).toThrow();
	});

	it('rejects with the server error message', async () => {
		session = await McpStdioSession.open({ command: process.execPath, args: [MOCK_SERVER], env: process.env as Record<string, string> }, CLIENT);

		await expect(session.request('resources/list', {})).rejects.toThrow('Unknown method: resources/list');
	});

	it('fails to open when the command does not exist', async () => {
		await expect(McpStdioSession.open({ command: 'definitely-not-a-command-ia', args: [], env: {} }, CLIENT)).rejects.toThrow();
	});

	it('rejects pending requests when the server exits', async () => {
		session = await McpStdioSession.open({ command: process.execPath, args: [MOCK_SERVER], env: process.env as Record<string, string> }, CLIENT);

		await expect(session.request('shutdown', {}).then(() => session!.request('tools/list', {}))).rejects.toThrow();
	});

	it('turns writes to a server that already exited into rejected requests, not crashes', async () => {
		session = await McpStdioSession.open({ command: process.execPath, args: ['-e', `
			process.stdin.once('data', (chunk) => {
				const message = JSON.parse(chunk.toString().split('\\n')[0]);
				process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\\n', () => process.exit(0));
			});
		`], env: process.env as Record<string, string> }, CLIENT);

		const results = await Promise.allSettled(Array.from({ length: 20 }, () => session!.request('tools/list', {})));

		expect(results.every(result => result.status === 'rejected')).toBe(true);
	});

	it('times out a request the server never answers', async () => {
		session = await McpStdioSession.open({ command: process.execPath, args: ['-e', `
			process.stdin.on('data', (chunk) => {
				for (const line of chunk.toString().split('\\n').filter(Boolean)) {
					const message = JSON.parse(line);
					if (message.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\\n');
				}
			});
		`], env: process.env as Record<string, string> }, CLIENT, { requestTimeoutMs: 100 });

		await expect(session.request('tools/list', {})).rejects.toThrow('timed out');
	});
});
