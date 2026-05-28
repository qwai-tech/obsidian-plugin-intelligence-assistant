import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { reloadPlugin, waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

describe('Chat conversation persistence', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('restores the latest conversation after plugin reload', async () => {
		await mockLLM.replyWith('persisted reply');

		await chat.sendMessage('remember this');
		await chat.waitForReplyComplete();

		const conversationId = await chat.getConversationId();
		await expect(conversationId).not.toBe('');
		await vault.findRuntimeConversationFile(conversationId);

		await reloadPlugin();
		await chat.open();
		await chat.waitForAssistantText('persisted reply');

		await expect(await chat.getConversationId()).toBe(conversationId);
		const messages = await chat.getMessages();
		await expect(messages).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('remember this') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('persisted reply') }),
		]);
	});
});
