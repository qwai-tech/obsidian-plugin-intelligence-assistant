import * as path from 'node:path';
import { McpSettingsPage } from '../../pages/settings/mcp-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface McpServersFile {
	servers: Array<{
		name: string;
		command: string;
		args: string[];
		cachedTools?: Array<{ name: string; description?: string }>;
	}>;
}

interface McpToolCacheFile {
	server: string;
	tools: Array<{ name: string; description?: string }>;
}

describe('MCP settings CRUD', () => {
	const settings = new McpSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await settings.open();
	});

	it('adds a stdio MCP server, connects it, and persists cached tools', async () => {
		const scriptPath = path.resolve('tests/e2e/support/mock-mcp-server.js');

		await settings.addServer({
			name: 'e2e-mcp',
			command: 'node',
			args: scriptPath,
		});
		await settings.connectServer('e2e-mcp');

		await browser.waitUntil(
			async () => {
				const serverFile = await vault.readRuntimeDataFile<McpServersFile>('data/mcp-servers.json');
				const server = serverFile.servers.find(candidate => candidate.name === 'e2e-mcp');
				return server?.cachedTools?.some(tool => tool.name === 'vault_echo') ?? false;
			},
			{ timeout: 15_000, timeoutMsg: 'MCP server tools were not cached on the server config' }
		);

		const serverFile = await vault.readRuntimeDataFile<McpServersFile>('data/mcp-servers.json');
		await expect(serverFile.servers).toEqual(expect.arrayContaining([
			expect.objectContaining({
				name: 'e2e-mcp',
				command: 'node',
				args: [scriptPath],
				cachedTools: expect.arrayContaining([
					expect.objectContaining({ name: 'vault_echo' }),
				]),
			}),
		]));

		const cacheFiles = await vault.listRuntimeDataFiles('data/cache/mcp-tools');
		const cacheContents = await Promise.all(
			cacheFiles.map(file => vault.readRuntimeDataFile<McpToolCacheFile>(file))
		);
		await expect(cacheContents).toEqual(expect.arrayContaining([
			expect.objectContaining({
				server: 'e2e-mcp',
				tools: expect.arrayContaining([
					expect.objectContaining({ name: 'vault_echo' }),
				]),
			}),
		]));
	});
});
