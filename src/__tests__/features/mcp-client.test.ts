import * as path from 'node:path';
import { MCPClient } from '@/features/tools/mcp-client';

const MOCK_SERVER = path.resolve('tests/e2e/support/mock-mcp-server.js');

describe('MCPClient', () => {
	it('connects to a stdio server, lists its tools and returns the text of a tool result', async () => {
		const client = new MCPClient({ name: 'mock', command: process.execPath, args: [MOCK_SERVER], enabled: true } as never);
		await client.connect();
		try {
			expect(client.isConnected()).toBe(true);
			expect((await client.listTools()).map(tool => tool.name)).toEqual(['vault_echo']);
			expect(await client.callTool('vault_echo', { text: 'ok' })).toBe('MCP_SENTINEL ok');
		} finally {
			await client.disconnect();
		}
		expect(client.isConnected()).toBe(false);
	});

	it('reports a crashed server as disconnected and starts it again on the next call', async () => {
		const client = new MCPClient({ name: 'mock', command: process.execPath, args: [MOCK_SERVER], enabled: true } as never);
		await client.connect();
		try {
			await expect(client.callTool('vault_echo', { text: 'crash' })).rejects.toThrow();
			expect(client.isConnected()).toBe(false);

			expect(await client.callTool('vault_echo', { text: 'back' })).toBe('MCP_SENTINEL back');
			expect(client.isConnected()).toBe(true);
		} finally {
			await client.disconnect();
		}
	});

	it('does not start a server again after an explicit disconnect', async () => {
		const client = new MCPClient({ name: 'mock', command: process.execPath, args: [MOCK_SERVER], enabled: true } as never);
		await client.connect();
		await client.disconnect();

		await expect(client.callTool('vault_echo', { text: 'x' })).rejects.toThrow('Not connected');
	});
});

