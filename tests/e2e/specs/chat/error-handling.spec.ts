import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

describe('Chat error handling', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
		// Use chat mode so a single LLM call consumes the queued error response
		// (agent mode makes extra calls that would consume it first).
		await chat.selectMode('chat');
	});

	it('renders and persists a failed assistant message for API errors', async () => {
		await mockLLM.errorStatus(500);

		await chat.sendMessage('trigger an error');
		await chat.waitForAssistantText('Mock LLM error 500');

		const messages = await chat.getMessages();
		await expect(messages).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('trigger an error') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('Mock LLM error 500') }),
		]);

		const conversationId = await chat.getConversationId();
		const conversationPath = await vault.findRuntimeConversationFile(conversationId);
		const conversation = await vault.readRuntimeDataFile<{ messages: Array<{ role: string; content: string }> }>(conversationPath);
		await expect(conversation.messages).toEqual([
			expect.objectContaining({ role: 'user', content: expect.stringContaining('trigger an error') }),
			expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Mock LLM error 500') }),
		]);
	});
});
