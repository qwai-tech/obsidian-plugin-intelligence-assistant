import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	model?: string;
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
	tools?: Array<{ type: string; function: { name: string } }>;
}

describe('Agent tool call loop', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('executes a tool call, shows the trace, and sends tool output into the follow-up LLM call', async () => {
		await mockLLM.toolCall('read_file', { path: 'test-note.md' });
		await mockLLM.replyWith('The note contains AGENT_TOOL_SENTINEL from the vault.');

		await chat.selectMode('agent');
		await chat.sendMessage('Read test-note.md and report the sentinel.');
		await chat.waitForReplyComplete(20_000);

		const traceText = await chat.getToolTraceText();
		await expect(traceText).toContain('read_file');
		await expect(traceText).toContain('AGENT_TOOL_SENTINEL');
		await expect(await chat.getLastAssistantText()).toContain('AGENT_TOOL_SENTINEL');

		const calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);

		await expect(calls).toHaveLength(2);
		await expect(calls[0]?.tools?.map(tool => tool.function.name)).toContain('read_file');
		await expect(calls[1]?.messages).toEqual(expect.arrayContaining([
			expect.objectContaining({
				role: 'tool',
				content: expect.stringContaining('AGENT_TOOL_SENTINEL'),
			}),
		]));
	});
});
