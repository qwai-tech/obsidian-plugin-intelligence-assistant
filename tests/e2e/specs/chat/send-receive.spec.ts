import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface PersistedConversation {
	messages: Array<{ role: string; content: string }>;
}

interface StreamChatRequest {
	model?: string;
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
}

describe('Chat send and receive', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('renders a mocked assistant reply and persists the conversation', async () => {
		await mockLLM.replyWith('Route C reply');

		await chat.sendMessage('What is the next Route C task?');
		await chat.waitForReplyComplete();

		const messages = await chat.getMessages();
		await expect(messages).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('What is the next Route C task?') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('Route C reply') }),
		]);

		const conversationId = await chat.getConversationId();
		await expect(conversationId).not.toBe('');
		const conversationPath = await vault.findRuntimeConversationFile(conversationId);
		const conversation = await vault.readRuntimeDataFile<PersistedConversation>(conversationPath);
		await expect(conversation.messages).toEqual([
			expect.objectContaining({ role: 'user', content: expect.stringContaining('What is the next Route C task?') }),
			expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Route C reply') }),
		]);

		const calls = await mockLLM.getCalls();
		const chatCalls = calls
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);
		await expect(chatCalls).toHaveLength(1);
		await expect(chatCalls[0]).toMatchObject({
			model: 'gpt-4o-mini',
			stream: true,
			messages: expect.arrayContaining([
				expect.objectContaining({ role: 'user', content: expect.stringContaining('What is the next Route C task?') }),
			]),
		});
	});
});
