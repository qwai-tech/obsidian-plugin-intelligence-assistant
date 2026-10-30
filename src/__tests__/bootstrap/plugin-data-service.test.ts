import { PluginDataService } from '@/bootstrap/plugin-data-service';
import { pluginPaths } from '@/core/plugin-paths';
import type { MCPServerConfig } from '@/features/tools';

function makeApp() {
	const store: Record<string, string> = {};
	const adapter = {
		exists: jest.fn(async (path: string) => path in store || Object.keys(store).some(file => file.startsWith(`${path}/`))),
		read: jest.fn(async (path: string) => store[path]),
		write: jest.fn(async (path: string, data: string) => { store[path] = data; }),
		remove: jest.fn(async (path: string) => { delete store[path]; }),
		rename: jest.fn(async (from: string, to: string) => { store[to] = store[from]; delete store[from]; }),
		mkdir: jest.fn(async () => {}),
		list: jest.fn(async (folder: string) => ({ files: Object.keys(store).filter(path => path.startsWith(`${folder}/`)), folders: [] })),
	};
	return { vault: { adapter } } as never;
}

describe('PluginDataService', () => {
	it('round-trips MCP tool caches by server name', async () => {
		const service = new PluginDataService(makeApp(), pluginPaths('.obsidian/plugins/intelligence-assistant'));
		service.initialize();
		const tools = [{ name: 'echo', description: 'Echo', inputSchema: {} }];

		await service.persistMcpToolCaches([{ name: 'srv', cachedTools: tools, cacheTimestamp: 7 } as MCPServerConfig]);
		const servers = [{ name: 'srv' } as MCPServerConfig, { name: 'other' } as MCPServerConfig];
		await service.applyMcpToolCaches(servers);

		expect(servers[0].cachedTools).toEqual(tools);
		expect(servers[0].cacheTimestamp).toBe(7);
		expect(servers[1].cachedTools).toBeUndefined();
	});
});
