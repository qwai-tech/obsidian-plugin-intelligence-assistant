import { AgentsSettingsPage } from '../../pages/settings/agents-settings.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface PersistedAgent {
	id: string;
	name: string;
}

interface AgentIndex {
	agents: Array<{ id: string; file: string }>;
}

describe('Agent settings CRUD', () => {
	const agents = new AgentsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await agents.open();
	});

	it('creates, updates, reloads, and deletes an agent with data-file persistence', async () => {
		const agentId = await agents.createAgent();
		await agents.renameAgent('New Agent', 'Research Agent E2E');
		await agents.renameAgent('Research Agent E2E', 'Research Agent Updated');

		const agentPath = await findPersistedAgentPath(vault, agentId);
		await browser.waitUntil(
			async () => vault.runtimeDataFileExists(agentPath),
			{ timeout: 10_000, timeoutMsg: `Agent file not written: ${agentPath}` }
		);
		await expect(await vault.readRuntimeDataFile<PersistedAgent>(agentPath)).toEqual(expect.objectContaining({
			id: agentId,
			name: 'Research Agent Updated',
		}));

		await reloadPlugin();
		await agents.open();
		await expect(await agents.hasAgentNamed('Research Agent Updated')).toBe(true);

		await agents.deleteAgent('Research Agent Updated');
		await browser.waitUntil(
			async () => !(await vault.runtimeDataFileExists(agentPath)),
			{ timeout: 10_000, timeoutMsg: `Agent file still exists: ${agentPath}` }
		);
		await expect(await agents.hasAgentNamed('Research Agent Updated')).toBe(false);
	});
});

async function findPersistedAgentPath(vault: VaultFixture, agentId: string): Promise<string> {
	await browser.waitUntil(
		async () => vault.runtimeDataFileExists('data/agents/index.json'),
		{ timeout: 10_000, timeoutMsg: 'Agent index not written' }
	);
	const index = await vault.readRuntimeDataFile<AgentIndex>('data/agents/index.json');
	const entry = index.agents.find(agent => agent.id === agentId);
	if (!entry) {
		throw new Error(`Agent index entry not found: ${agentId}`);
	}
	return entry.file.replace(/^\.obsidian\/plugins\/intelligence-assistant\//, '');
}
