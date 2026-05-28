import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

describe('Chat conversation isolation', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('switches conversations without leaking messages between histories', async () => {
		await mockLLM.replyWith('alpha reply');
		await chat.sendMessage('alpha question');
		await chat.waitForAssistantText('alpha reply');
		const alphaConversationId = await chat.getConversationId();

		await chat.newChat();
		await mockLLM.replyWith('beta reply');
		await chat.sendMessage('beta question');
		await chat.waitForAssistantText('beta reply');
		const betaConversationId = await chat.getConversationId();
		await expect(betaConversationId).not.toBe(alphaConversationId);

		await chat.switchConversation(alphaConversationId);

		await expect(await chat.getConversationId()).toBe(alphaConversationId);
		await expect(await chat.getMessages()).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('alpha question') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('alpha reply') }),
		]);
		await expect(await chat.getLastAssistantText()).not.toContain('beta reply');

		await chat.switchConversation(betaConversationId);

		await expect(await chat.getConversationId()).toBe(betaConversationId);
		await expect(await chat.getMessages()).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('beta question') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('beta reply') }),
		]);
		await expect(await chat.getLastAssistantText()).not.toContain('alpha reply');
	});
});
