import { LlmSettingsPage } from '../../../pages/settings/llm-settings.page';
import { RagSettingsPage } from '../../../pages/settings/rag-settings.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { AgentsSettingsPage } from '../../../pages/settings/agents-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

describe('UX review: settings safety', () => {
	const llm = new LlmSettingsPage();
	const rag = new RagSettingsPage();
	const tools = new ToolsSettingsPage();
	const agents = new AgentsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await probe.clearNotices();
	});

	afterEach(async () => {
		await tools.closeSettings();
	});

	it('#2 does not report success when a Custom provider has no base URL', async () => {
		await llm.openProviderTab();
		await llm.openNewProviderForm({ provider: 'custom' });
		await llm.testConnectionInForm();

		const notice = await probe.waitForNotice(() => true);
		expect(notice).not.toMatch(/successful/i);
		expect(notice).toMatch(/base url/i);
	});

	it('#4a asks before clearing the RAG index', async () => {
		await rag.open();
		await probe.clickButton('Clear');

		expect(await probe.confirmDialogText()).toMatch(/index/i);
		await probe.answerConfirm(true);
		await probe.waitForNotice(text => /cleared/i.test(text));
	});

	it('#4b asks before deleting a CLI tool, and keeps it on cancel', async () => {
		await tools.createCliTool({ id: 'ux-cli', name: 'UX CLI', command: 'echo', args: ['ok'], enabled: true, parameters: [] } as never);
		await probe.clickButton('Delete', '[data-testid="ia-tools-cli-row"]');

		expect(await probe.confirmDialogText()).toMatch(/UX CLI/);
		await probe.answerConfirm(false);
		await tools.waitForCliRow('ux-cli');

		await probe.clickButton('Delete', '[data-testid="ia-tools-cli-row"]');
		await probe.answerConfirm(true);
		await probe.waitForNotice(text => text === 'CLI tool removed');
		expect(await tools.getRegisteredToolNames('cli')).toEqual([]);
	});

	it('#4c asks before deleting an HTTP source, and keeps it on cancel', async () => {
		await tools.createOpenApiTool(
			{ id: 'ux-openapi', name: 'UX HTTP source', enabled: true, sourceType: 'file', specPath: 'ux-openapi.json', baseUrl: 'http://127.0.0.1:9', authType: 'none' } as never,
			'ux-openapi.json',
			{ openapi: '3.0.0', info: { title: 'UX', version: '1' }, paths: { '/ping': { get: { operationId: 'ping', responses: { '200': { description: 'OK' } } } } } },
		);
		await probe.clickButton('Delete', '[data-testid="ia-tools-openapi-row"]');

		expect(await probe.confirmDialogText()).toMatch(/UX HTTP source/);
		await probe.answerConfirm(false);
		await tools.waitForOpenApiRow('ux-openapi');

		await probe.clickButton('Delete', '[data-testid="ia-tools-openapi-row"]');
		await probe.answerConfirm(true);
		await probe.waitForNotice(text => text === 'HTTP source removed');
		expect(await tools.getRegisteredToolNames('openapi', 'ux-openapi')).toEqual([]);
	});

	it('#6 labels the autonomous write option in the interface language', async () => {
		await agents.open();
		await agents.openAgentEditor('builtin-generalist-agent');

		const names = await probe.settingNamesIn('.modal-container');
		const autonomous = names.find(name => /autonomous/i.test(name)) ?? '';
		expect(autonomous).not.toBe('');
		expect(autonomous).not.toMatch(/[一-鿿]/);
	});
});
