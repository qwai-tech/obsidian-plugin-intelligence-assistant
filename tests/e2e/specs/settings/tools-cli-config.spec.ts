import { ToolsSettingsPage } from '../../pages/settings/tools-settings.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface UserSettings {
	tools?: {
		cli?: Array<{
			id: string;
			name: string;
			command: string;
			args?: string[];
			enabled: boolean;
		}>;
	};
}

describe('CLI tool settings', () => {
	const tools = new ToolsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	it('persists a CLI tool configuration across plugin reloads', async () => {
		await tools.createCliTool({
			id: 'cli-e2e-echo',
			name: 'echo_sentinel',
			description: 'Echoes a sentinel value for E2E settings coverage.',
			command: 'node',
			args: ['-e', 'console.log(process.argv[1])', 'CLI_SENTINEL'],
			enabled: true,
			timeout: 30_000,
			shell: false,
			parameters: [],
		});

		let toolNames = await tools.getRegisteredToolNames('cli', 'cli-e2e-echo');
		await expect(toolNames).toContain('echo_sentinel');

		await reloadPlugin();
		await tools.open('cli');
		await tools.waitForCliRow('cli-e2e-echo');

		toolNames = await tools.getRegisteredToolNames('cli', 'cli-e2e-echo');
		await expect(toolNames).toContain('echo_sentinel');

		const settings = await vault.readRuntimeDataFile<UserSettings>('config/user/settings.json');
		await expect(settings.tools?.cli).toEqual(expect.arrayContaining([
			expect.objectContaining({
				id: 'cli-e2e-echo',
				name: 'echo_sentinel',
				command: 'node',
				args: ['-e', 'console.log(process.argv[1])', 'CLI_SENTINEL'],
				enabled: true,
			}),
		]));
	});
});
