import { ToolsSettingsPage } from '../../pages/settings/tools-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface UserSettings {
	tools?: {
		openapi?: Array<{
			id: string;
			name: string;
			enabled: boolean;
			specPath?: string;
		}>;
	};
}

describe('OpenAPI tool settings', () => {
	const tools = new ToolsSettingsPage();
	const vault = new VaultFixture();
	const specPath = 'E2E OpenAPI/e2e-ping.json';

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	afterEach(async () => {
		await browser.execute(async (path) => {
			const adapter = (window as unknown as {
				app: { vault: { adapter: { exists(path: string): Promise<boolean>; remove(path: string): Promise<void> } } };
			}).app.vault.adapter;
			if (await adapter.exists(path)) {
				await adapter.remove(path);
			}
		}, specPath);
	});

	it('imports a local OpenAPI spec, registers the generated tool, and persists the config', async () => {
		await tools.createOpenApiTool(
			{
				id: 'openapi-e2e-ping',
				name: 'E2E Ping API',
				enabled: true,
				sourceType: 'file',
				specPath,
				baseUrl: 'http://127.0.0.1:43117',
				authType: 'none',
			},
			specPath,
			{
				openapi: '3.0.0',
				info: { title: 'E2E Ping API', version: '1.0.0' },
				paths: {
					'/ping': {
						get: {
							operationId: 'ping',
							summary: 'Ping the E2E service',
							responses: { '200': { description: 'OK' } },
						},
					},
				},
			}
		);

		const toolNames = await tools.getRegisteredToolNames('openapi', 'openapi-e2e-ping');
		await expect(toolNames).toContain('e2e_ping_api_ping');

		const settings = await vault.readRuntimeDataFile<UserSettings>('config/user/settings.json');
		await expect(settings.tools?.openapi).toEqual(expect.arrayContaining([
			expect.objectContaining({
				id: 'openapi-e2e-ping',
				name: 'E2E Ping API',
				enabled: true,
				specPath,
			}),
		]));
	});
});
