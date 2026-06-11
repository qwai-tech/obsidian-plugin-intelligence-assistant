import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { skipUnlessReleaseLLM } from '../../support/release-env';
import { VaultFixture } from '../../support/vault-fixture';

interface PersistedConversation {
	messages: Array<{
		role: string;
		content: string;
		tokenUsage?: {
			promptTokens?: number;
			completionTokens?: number;
			totalTokens?: number;
		};
	}>;
}

describe('Release real chat', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	before(function (this: Mocha.Context) {
		skipUnlessReleaseLLM(this);
	});

	beforeEach(async () => {
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('gets a non-empty reply from the configured real LLM and records token usage when available', async () => {
		await chat.sendMessage('Reply with exactly ROUTE_C_RELEASE_CHAT_SENTINEL and no other text.');
		await chat.waitForReplyComplete(120_000);

		const reply = await chat.getLastAssistantText();
		await expect(reply.trim()).not.toBe('');
		await expect(reply).toContain('ROUTE_C_RELEASE_CHAT_SENTINEL');

		const conversationId = await chat.getConversationId();
		await expect(conversationId).not.toBe('');
		const conversationPath = await vault.findRuntimeConversationFile(conversationId, 10_000);
		const conversation = await vault.readRuntimeDataFile<PersistedConversation>(conversationPath);
		const assistantMessages = conversation.messages.filter(message => message.role === 'assistant');
		const assistant = assistantMessages[assistantMessages.length - 1];
		void assistant;
	});
});
