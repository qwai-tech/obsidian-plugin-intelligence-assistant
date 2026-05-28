import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { ToolsSettingsPage } from '../../pages/settings/tools-settings.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	stream?: boolean;
	tools?: Array<{ type: string; function: { name: string } }>;
}

describe('Built-in tool settings', () => {
	const chat = new ChatViewPage();
	const tools = new ToolsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'agent-builtins-all',
				name: 'Built-ins All Agent',
				toolAccess: { sources: { 'builtin:builtin': 'all' } },
			})],
			activeAgentId: 'agent-builtins-all',
		});
	});

	it('filters disabled built-in tools out of the agent tool list and restores them when re-enabled', async () => {
		await tools.setBuiltinToolEnabled('read_file', false);
		await tools.closeSettings();
		await mockLLM.replyWith('Read file is disabled.');

		await chat.open();
		await chat.newChat();
		await chat.selectMode('agent');
		await chat.sendMessage('What tools are available?');
		await chat.waitForReplyComplete(20_000);

		let calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);
		let toolNames = calls[0]?.tools?.map(tool => tool.function.name) ?? [];
		await expect(toolNames).not.toContain('read_file');
		await expect(toolNames).toContain('list_files');

		await tools.setBuiltinToolEnabled('read_file', true);
		await tools.closeSettings();
		await mockLLM.clearAll();
		await mockLLM.replyWith('Read file is enabled again.');

		await chat.open();
		await chat.newChat();
		await chat.selectMode('agent');
		await chat.sendMessage('What tools are available now?');
		await chat.waitForReplyComplete(20_000);

		calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);
		toolNames = calls[0]?.tools?.map(tool => tool.function.name) ?? [];
		await expect(toolNames).toContain('read_file');
	});
});
