import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

describe('Chat streaming', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
		await chat.selectMode('chat');
	});

	it('renders partial chunks before the stream completes', async () => {
		await mockLLM.streaming(['hello', ' world'], { chunkDelayMs: 750 });

		await chat.sendMessage('stream please');
		await chat.waitForAssistantText('hello');

		const partialText = await chat.getLastAssistantText();
		await expect(partialText).toContain('hello');
		await expect(partialText).not.toContain('world');

		await chat.waitForReplyComplete();

		const finalText = await chat.getLastAssistantText();
		await expect(finalText).toContain('hello world');

		const calls = await mockLLM.getCalls();
		const streamCalls = calls.filter((call) => {
			const body = call.body as { stream?: boolean } | null;
			return body?.stream === true;
		});
		await expect(streamCalls).toHaveLength(1);
		await expect(streamCalls[0].body).toMatchObject({ model: 'gpt-4o-mini' });
	});
});
