import { AgentsSettingsPage } from '../../pages/settings/agents-settings.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

describe('Agent settings CRUD', () => {
	const agents = new AgentsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await agents.open();
	});

	it('creates, updates, reloads, and deletes an agent persisted in data.json', async () => {
		const agentId = await agents.createAgent();
		await agents.renameAgent('New Agent', 'Research Agent E2E');
		await agents.renameAgent('Research Agent E2E', 'Research Agent Updated');

		const settings = await vault.waitForSettings(
			candidate => candidate.agents.list.some(agent => agent.id === agentId && agent.name === 'Research Agent Updated'),
			`Agent ${agentId} was not persisted with its new name`
		);
		expect(settings.agents.list).toEqual(expect.arrayContaining([
			expect.objectContaining({ id: agentId, name: 'Research Agent Updated' }),
		]));

		await reloadPlugin();
		await agents.open();
		expect(await agents.hasAgentNamed('Research Agent Updated')).toBe(true);

		await agents.deleteAgent('Research Agent Updated');
		await vault.waitForSettings(
			candidate => !candidate.agents.list.some(agent => agent.id === agentId),
			`Agent ${agentId} is still persisted`
		);
		expect(await agents.hasAgentNamed('Research Agent Updated')).toBe(false);
	});
});
