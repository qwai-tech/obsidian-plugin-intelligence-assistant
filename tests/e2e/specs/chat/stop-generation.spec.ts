import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

describe('Chat stop generation', () => {
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

	it('keeps partial content and ignores later chunks after stop', async () => {
		await mockLLM.streaming(['partial', ' ignored', ' discarded'], { chunkDelayMs: 750 });

		await chat.sendMessage('stop after first chunk');
		await chat.waitForAssistantText('partial');
		expect(await chat.isStopBtnVisible()).toBe(true);

		await chat.stopGeneration();
		await chat.waitForReplyComplete();

		const finalText = await chat.getLastAssistantText();
		expect(finalText).toContain('partial');
		expect(finalText).not.toContain('ignored');
		expect(finalText).not.toContain('discarded');

		const conversationId = await chat.getConversationId();
		const conversationPath = await vault.findRuntimeConversationFile(conversationId);
		let conversation = await vault.readRuntimeDataFile<{ messages: Array<{ role: string; content: string }> }>(conversationPath);
		await browser.waitUntil(
			async () => {
				conversation = await vault.readRuntimeDataFile<{ messages: Array<{ role: string; content: string }> }>(conversationPath);
				return conversation.messages.some((message) => message.role === 'assistant');
			},
			{ timeout: 5_000, timeoutMsg: 'Stopped conversation was not persisted with an assistant message' }
		);
		const assistant = conversation.messages.find((message) => message.role === 'assistant');
		expect(assistant?.content).toContain('partial');
		expect(assistant?.content).not.toContain('ignored');
		expect(assistant?.content).not.toContain('discarded');
	});
});
