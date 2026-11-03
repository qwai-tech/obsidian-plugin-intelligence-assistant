import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { reloadPlugin, waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

const SECRET = 'ux-secret-9931';

describe('UX review: HTTP source credential and delete', () => {
	const tools = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();
	const received: string[] = [];
	let server: http.Server;
	let baseUrl = '';

	before(async () => {
		server = http.createServer((request, response) => {
			received.push(String(request.headers['x-api-key'] ?? ''));
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end('{"ok":true}');
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		await vault.reset();
		await waitForPluginReady();
		await tools.createOpenApiTool(
			{ id: 'ux-auth', name: 'UX auth source', enabled: true, sourceType: 'file', specPath: 'ux-auth.json', baseUrl, authType: 'header', authKey: 'X-Api-Key', authValue: SECRET } as never,
			'ux-auth.json',
			{ openapi: '3.0.0', info: { title: 'UX auth', version: '1' }, paths: { '/ping': { get: { operationId: 'ping', responses: { '200': { description: 'OK' } } } } } },
		);
	});

	after(async () => {
		await tools.closeSettings();
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	it('#5 keeps the credential out of plain-text fields and saved settings, and still sends it', async () => {
		await probe.clickButton('Edit', '[data-testid="ia-tools-openapi-row"]');

		expect(await tools.modalInputValues('.modal-container:not(:has(.mod-settings))')).not.toContain(SECRET);
		expect(await tools.savedPluginData()).not.toContain(SECRET);
		await tools.runRegisteredTool('ux_auth_source_ping', {});
		expect(received).toContain(SECRET);
	});

	it('#5 labels the delete action in the source dialog and asks before deleting', async () => {
		await probe.clickButton('Delete', '.modal-container:not(:has(.mod-settings))');

		expect(await probe.confirmDialogText()).toMatch(/UX auth source/);
		await probe.answerConfirm(false);
	});

	it('#5 still sends the credential after the plugin restarts', async () => {
		await probe.answerConfirm(false).catch(() => undefined);
		await tools.closeSettings();
		received.length = 0;
		await reloadPlugin();
		await browser.waitUntil(async () => (await tools.getRegisteredToolNames('openapi', 'ux-auth').catch(() => [])).length > 0, { timeout: 15_000, timeoutMsg: 'HTTP source tools were not restored' });

		await tools.runRegisteredTool('ux_auth_source_ping', {});

		expect(received).toEqual([SECRET]);
		expect(await tools.savedPluginData()).not.toContain(SECRET);
	});
});
