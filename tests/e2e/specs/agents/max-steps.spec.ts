import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { createAgentConfig } from '../../support/data-fixtures';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
}

describe('Agent max steps', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await vault.seedSettings({
			agents: [createAgentConfig({
				id: 'agent-two-steps',
				name: 'Two Step Agent',
				maxSteps: 2,
			})],
			activeAgentId: 'agent-two-steps',
		});
		await chat.open();
		await chat.newChat();
	});

	it('stops after the configured max steps and tells the user', async () => {
		await mockLLM.toolCall('read_file', { path: 'test-note.md' }, 'call_step_1');
		await mockLLM.toolCall('read_file', { path: 'test-note.md' }, 'call_step_2');

		await chat.selectMode('agent');
		await chat.sendMessage('Keep reading test-note.md until you are done.');
		await chat.waitForReplyComplete(20_000);

		const assistantText = await chat.getLastAssistantText();
		await expect(assistantText).toContain('Reached the agent step limit of 2');

		const traceText = await chat.getToolTraceText();
		await expect((traceText.match(/read_file/g) ?? [])).toHaveLength(2);

		const calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);

		await expect(calls).toHaveLength(2);
		await expect(calls[1]?.messages).toEqual(expect.arrayContaining([
			expect.objectContaining({
				role: 'tool',
				content: expect.stringContaining('AGENT_TOOL_SENTINEL'),
			}),
		]));
	});
});
