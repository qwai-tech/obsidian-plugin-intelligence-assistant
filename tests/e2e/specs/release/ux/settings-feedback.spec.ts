import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { LlmSettingsPage } from '../../../pages/settings/llm-settings.page';
import { RagSettingsPage } from '../../../pages/settings/rag-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { reloadPlugin, waitForPluginReady } from '../../../support/plugin-helpers';
import { skipUnlessOllama } from '../../../support/ollama-env';
import { VaultFixture } from '../../../support/vault-fixture';

const SPEC = JSON.stringify({ openapi: '3.0.0', info: { title: 'UX fetch', version: '1' }, paths: { '/ping': { get: { operationId: 'ping', responses: { '200': { description: 'OK' } } } } } });
const SOURCE_DIALOG = '.modal-container:not(:has(.mod-settings))';

describe('UX review: settings feedback and wording', () => {
	const llm = new LlmSettingsPage();
	const rag = new RagSettingsPage();
	const tools = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();
	let server: http.Server;
	let specUrl = '';

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		server = http.createServer((_request, response) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(SPEC);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		specUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/openapi.json`;
		await vault.reset();
		await waitForPluginReady();
	});

	after(async () => {
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	beforeEach(async () => {
		await probe.clearNotices();
	});

	afterEach(async () => {
		await tools.closeSettings();
	});

	it('P2 web search provider setting no longer promises scrapers', async () => {
		await rag.open();
		await probe.clickButton('Web search');

		expect(await probe.settingDescription('Search provider')).not.toMatch(/scraper/i);
	});

	it('P2 provider messages use the provider name, not its internal type', async () => {
		await llm.openProviderTab();
		await llm.openNewProviderForm({ provider: 'custom', baseUrl: 'http://localhost:11434/v1', apiKey: { secret: 'ux-feedback-key', value: 'local' } });
		await llm.saveProviderForm('custom');

		await llm.refreshProviderModels('custom');
		const refreshed = await probe.waitForNotice(text => /refreshed/i.test(text), 30_000);
		await probe.clickButton('Delete', '[data-testid="ia-provider-row"][data-provider-id="custom"]');
		const confirm = await probe.confirmDialogText();
		await probe.answerConfirm(false);

		expect(refreshed).not.toMatch(/\bcustom\b/);
		expect(confirm).not.toMatch(/\bcustom\b/);
	});

	it('P2 a failed HTTP source reload says it failed', async () => {
		await tools.saveOpenApiConfig({ id: 'ux-missing', name: 'UX missing spec', enabled: true, sourceType: 'file', specPath: 'does-not-exist.json', authType: 'none' } as never);
		await tools.open('openapi');
		await tools.waitForOpenApiRow('ux-missing');
		await probe.clickButton('Reload', '[data-testid="ia-tools-openapi-row"][data-openapi-id="ux-missing"]');

		expect(await probe.waitForNotice(() => true)).toMatch(/fail/i);
	});

	it('P2 a fetched URL source shows when it was fetched', async () => {
		await tools.saveOpenApiConfig({ id: 'ux-fetched', name: 'UX fetched source', enabled: true, sourceType: 'url', specUrl, baseUrl: 'http://127.0.0.1:9', authType: 'none' } as never);
		await tools.open('openapi');
		await tools.waitForOpenApiRow('ux-fetched');
		await probe.clickButton('Refetch', '[data-testid="ia-tools-openapi-row"][data-openapi-id="ux-fetched"]');
		await probe.waitForNotice(text => /reloaded/i.test(text));
		await probe.clickButton('Edit', '[data-testid="ia-tools-openapi-row"][data-openapi-id="ux-fetched"]');

		expect(await probe.textIn(SOURCE_DIALOG)).not.toMatch(/never fetched/i);
	});

	it('P2 a URL source fetched by Reload shows when it was fetched', async () => {
		await tools.saveOpenApiConfig({ id: 'ux-first-fetch', name: 'UX first fetch', enabled: true, sourceType: 'url', specUrl, baseUrl: 'http://127.0.0.1:9', authType: 'none' } as never);
		await tools.open('openapi');
		await tools.waitForOpenApiRow('ux-first-fetch');
		await probe.clickButton('Reload', '[data-testid="ia-tools-openapi-row"][data-openapi-id="ux-first-fetch"]');
		await probe.waitForNotice(text => /reloaded/i.test(text));
		await probe.clickButton('Edit', '[data-testid="ia-tools-openapi-row"][data-openapi-id="ux-first-fetch"]');

		expect(await probe.textIn(SOURCE_DIALOG)).not.toMatch(/never fetched/i);
	});

	it('P2 a refetched URL source still shows when it was fetched after a restart', async () => {
		await reloadPlugin();
		await tools.open('openapi');
		await tools.waitForOpenApiRow('ux-fetched');
		await probe.clickButton('Edit', '[data-testid="ia-tools-openapi-row"][data-openapi-id="ux-fetched"]');

		expect(await probe.textIn(SOURCE_DIALOG)).not.toMatch(/never fetched/i);
	});
});
