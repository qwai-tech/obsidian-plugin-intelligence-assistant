import * as path from 'node:path';
import { MCPClient } from '@/features/tools/mcp-client';
import { McpToolSource } from '@/features/tools/sources/mcp-tool-source';

const MOCK_SERVER = path.resolve('tests/e2e/support/mock-mcp-server.js');

describe('McpToolSource', () => {
	it('stops the previous server process when it is loaded again', async () => {
		const disconnect = jest.spyOn(MCPClient.prototype, 'disconnect');
		const source = new McpToolSource({ name: 'mock', command: process.execPath, args: [MOCK_SERVER], enabled: true } as never);
		try {
			await source.load();
			await source.load();

			expect(disconnect).toHaveBeenCalledTimes(1);
		} finally {
			await source.dispose();
			disconnect.mockRestore();
		}
	});

	it('its tools start a crashed server again on the next call', async () => {
		const source = new McpToolSource({ name: 'mock', command: process.execPath, args: [MOCK_SERVER], enabled: true } as never);
		try {
			const [echo] = await source.load();
			expect((await echo.execute({ text: 'crash' })).success).toBe(false);

			expect(await echo.execute({ text: 'back' })).toEqual({ success: true, result: 'MCP_SENTINEL back' });
		} finally {
			await source.dispose();
		}
	});
});

