import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ToolsSettingsPage } from '../../pages/settings/tools-settings.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

const SPEC = JSON.stringify({
	openapi: '3.0.0',
	info: { title: 'Cached Ping API', version: '1.0.0' },
	paths: { '/ping': { get: { operationId: 'ping', summary: 'Ping', responses: { '200': { description: 'OK' } } } } },
});

describe('OpenAPI tools fetched from a URL', () => {
	const tools = new ToolsSettingsPage();
	const vault = new VaultFixture();
	let server: http.Server;
	let specUrl = '';

	before(async () => {
		server = http.createServer((_request, response) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(SPEC);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		specUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/openapi.json`;
	});

	after(async () => {
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	it('keeps its tools after a restart and can be refetched', async () => {
		await tools.saveOpenApiConfig({ id: 'qa-openapi-url', name: 'Cached Ping API', enabled: true, sourceType: 'url', specUrl, baseUrl: 'http://127.0.0.1:9', authType: 'none' });
		expect(await tools.reloadOpenApi('qa-openapi-url')).toBe(1);

		await reloadPlugin();
		await browser.waitUntil(async () => (await tools.getRegisteredToolNames('openapi', 'qa-openapi-url').catch(() => [])).length > 0, {
			timeout: 15_000,
			timeoutMsg: 'cached OpenAPI tools were not restored after restart',
		});

		expect(await tools.reloadOpenApi('qa-openapi-url', true)).toBe(1);
	});
});
