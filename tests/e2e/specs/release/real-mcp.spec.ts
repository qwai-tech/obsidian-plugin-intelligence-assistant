import { McpSettingsPage } from '../../pages/settings/mcp-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { skipUnlessReleaseMcp, type ReleaseEnv } from '../../support/release-env';
import { VaultFixture } from '../../support/vault-fixture';

interface McpServersFile {
	servers: Array<{
		name: string;
		cachedTools?: Array<{ name: string }>;
	}>;
}

interface ToolExecutionProbe {
	names: string[];
	success: boolean;
	text: string;
}

describe('Release real MCP', () => {
	const settings = new McpSettingsPage();
	const vault = new VaultFixture();
	let env: ReleaseEnv = { mcpName: 'release-mcp', mcpToolArgs: {} };

	before(function (this: Mocha.Context) {
		env = skipUnlessReleaseMcp(this);
	});

	beforeEach(async () => {
		await waitForPluginReady();
		await settings.open();
	});

	it('lists tools from a configured MCP subprocess and executes one tool round-trip', async () => {
		const toolName = env.mcpToolName;
		if (!toolName) {
			throw new Error('E2E_TEST_MCP_TOOL_NAME is required for real MCP release specs');
		}

		await settings.addServer({
			name: env.mcpName,
			command: env.mcpCommand!,
			args: env.mcpArgs,
		});
		await settings.connectServer(env.mcpName);

		await browser.waitUntil(
			async () => {
				const serverFile = await vault.readRuntimeDataFile<McpServersFile>('data/mcp-servers.json');
				const server = serverFile.servers.find(candidate => candidate.name === env.mcpName);
				return server?.cachedTools?.some(tool => tool.name === toolName) ?? false;
			},
			{ timeout: 30_000, timeoutMsg: `MCP tool was not listed: ${toolName}` }
		);

		const probe = await browser.execute(async (toolName, args) => {
			const plugin = (window as unknown as {
				app: {
					plugins: {
						plugins: Record<string, {
							getToolRegistry(): {
								getTools(): Array<{ llmName: string; origin: { kind: string } }>;
								executeTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }>;
							};
						}>;
					};
				};
			}).app.plugins.plugins['intelligence-assistant'];
			const registry = plugin.getToolRegistry();
			const names = registry.getTools()
				.filter(tool => tool.origin.kind === 'mcp')
				.map(tool => tool.llmName);
			const result = await registry.executeTool(toolName, args);
			return {
				names,
				success: result.success,
				text: JSON.stringify(result.result ?? result.error ?? result),
			};
		}, toolName, env.mcpToolArgs) as ToolExecutionProbe;

		await expect(probe.names).toContain(toolName);
		await expect(probe.success).toBe(true);
		if (env.mcpExpectedText) {
			await expect(probe.text).toContain(env.mcpExpectedText);
		}
		console.log('[release-e2e] real-mcp tool result:', probe.text);
	});
});
