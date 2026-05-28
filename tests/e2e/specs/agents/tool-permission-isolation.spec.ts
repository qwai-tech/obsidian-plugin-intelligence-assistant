import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
	tools?: Array<{ type: string; function: { name: string } }>;
}

describe('Agent tool permission isolation', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'agent-list-only',
				name: 'List Only Agent',
				toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:list_files'] } },
			})],
			activeAgentId: 'agent-list-only',
		});
		await chat.open();
		await chat.newChat();
	});

	it('blocks a tool call that is not enabled for the active agent', async () => {
		await mockLLM.toolCall('read_file', { path: 'test-note.md' });
		await mockLLM.replyWith('I could not read the file because read_file is not enabled.');

		await chat.selectMode('agent');
		await chat.sendMessage('Read test-note.md and report the sentinel.');
		await chat.waitForReplyComplete(20_000);

		const traceText = await chat.getToolTraceText();
		await expect(traceText).toContain('read_file');
		await expect(traceText).toContain('Tool "read_file" is not enabled for this agent');
		await expect(traceText).not.toContain('AGENT_TOOL_SENTINEL');

		const calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);

		await expect(calls).toHaveLength(2);
		await expect(calls[0]?.tools?.map(tool => tool.function.name)).toEqual(['list_files']);
		await expect(calls[1]?.messages).toEqual(expect.arrayContaining([
			expect.objectContaining({
				role: 'tool',
				content: expect.stringContaining('Tool "read_file" is not enabled for this agent'),
			}),
		]));
	});
});
