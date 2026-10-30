import * as path from 'node:path';
import { McpSettingsPage } from '../../pages/settings/mcp-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

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

	it('adds a stdio MCP server, connects it, and caches its tools outside data.json', async () => {
		const scriptPath = path.resolve('tests/e2e/support/mock-mcp-server.js');

		await settings.addServer({
			name: 'e2e-mcp',
			command: 'node',
			args: scriptPath,
		});
		await settings.connectServer('e2e-mcp');

		const stored = await vault.waitForSettings(
			candidate => candidate.config.tools?.mcp?.servers?.some(server => server.name === 'e2e-mcp') ?? false,
			'MCP server was not persisted'
		);
		expect(stored.config.tools?.mcp?.servers).toEqual(expect.arrayContaining([
			expect.objectContaining({ name: 'e2e-mcp', command: 'node', args: [scriptPath] }),
		]));
		expect(JSON.stringify(stored)).not.toContain('cachedTools');

		await browser.waitUntil(
			async () => (await vault.listRuntimeDataFiles('data/cache/mcp-tools')).length > 0,
			{ timeout: 15_000, timeoutMsg: 'MCP tools were not cached' }
		);
		const cacheFiles = await vault.listRuntimeDataFiles('data/cache/mcp-tools');
		const cacheContents = await Promise.all(
			cacheFiles.map(file => vault.readRuntimeDataFile<McpToolCacheFile>(file))
		);
		expect(cacheContents).toEqual(expect.arrayContaining([
			expect.objectContaining({
				server: 'e2e-mcp',
				tools: expect.arrayContaining([
					expect.objectContaining({ name: 'vault_echo' }),
				]),
			}),
		]));
	});
});
