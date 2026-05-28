import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { skipUnlessReleaseLLM } from '../../support/release-env';
import { VaultFixture } from '../../support/vault-fixture';

describe('Release real agent', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	before(function (this: Mocha.Context) {
		skipUnlessReleaseLLM(this);
	});

	beforeEach(async () => {
		await waitForPluginReady();
		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'release-read-file-agent',
				name: 'Release Read File Agent',
				toolAccess: { sources: { 'builtin:builtin': 'all' } },
				maxSteps: 4,
			})],
			activeAgentId: 'release-read-file-agent',
		});
		await chat.open();
		await chat.newChat();
	});

	it('uses a built-in tool to read a vault file and references the sentinel in the final reply', async () => {
		await chat.selectMode('agent');
		await chat.sendMessage([
			'Use the read_file tool to read test-note.md.',
			'Then reply with the exact sentinel string AGENT_TOOL_SENTINEL.',
			'Do not answer from memory; call the tool first.',
		].join(' '));
		await chat.waitForReplyComplete(120_000);

		const reply = await chat.getLastAssistantText();
		await expect(reply).not.toContain('❌ Error');
		const traceText = await chat.getToolTraceText();
		await expect(traceText).toContain('read_file');
		await expect(traceText).toContain('AGENT_TOOL_SENTINEL');
		await expect(reply).toContain('AGENT_TOOL_SENTINEL');
	});
});
