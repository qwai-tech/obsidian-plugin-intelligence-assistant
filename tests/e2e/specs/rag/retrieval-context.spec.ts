import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { RagSettingsPage } from '../../pages/settings/rag-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
}

interface PersistedConversation {
	messages: Array<{
		role: string;
		content: string;
		ragSources?: Array<{ path: string; content: string; similarity: number }>;
	}>;
}

function constantEmbeddings(count: number): number[][] {
	return Array.from({ length: count }, () => [1, 0, 0, 0]);
}

describe('RAG retrieval context', () => {
	const chat = new ChatViewPage();
	const ragSettings = new RagSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await ragSettings.configureForE2E();
	});

	it('injects retrieved vault context, renders sources, and persists ragSources', async () => {
		await mockLLM.embeddings(constantEmbeddings(40));
		await ragSettings.open();
		await ragSettings.rebuildIndex();

		await mockLLM.replyWith('PKM keeps projects, areas, resources, and archives distinct.');
		await chat.open();
		await chat.newChat();
		await chat.enableRag();
		await chat.sendMessage('What does PKM say about resources?');
		await chat.waitForReplyComplete(20_000);

		const sourceText = await chat.getRagSourceText();
		await expect(sourceText).toContain('PKM Principles.md');
		await expect(await chat.getLastAssistantText()).toContain('PKM keeps projects');

		const chatCalls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);
		await expect(chatCalls).toHaveLength(1);
		const systemContext = chatCalls[0]?.messages
			?.filter(message => message.role === 'system')
			.map(message => message.content)
			.join('\n') ?? '';
		await expect(systemContext).toContain('RAG Context');
		await expect(systemContext).toContain('PKM Principles.md');

		const conversationId = await chat.getConversationId();
		const conversationPath = await vault.findRuntimeConversationFile(conversationId);
		let conversation = await vault.readRuntimeDataFile<PersistedConversation>(conversationPath);
		await browser.waitUntil(
			async () => {
				conversation = await vault.readRuntimeDataFile<PersistedConversation>(conversationPath);
				return conversation.messages.some(message =>
					message.role === 'assistant'
					&& message.ragSources?.some(source => source.path === 'PKM Principles.md')
				);
			},
			{ timeout: 10_000, timeoutMsg: 'Persisted conversation did not include PKM RAG sources' }
		);
		await expect(conversation.messages).toEqual(expect.arrayContaining([
			expect.objectContaining({
				role: 'assistant',
				ragSources: expect.arrayContaining([
					expect.objectContaining({ path: 'PKM Principles.md' }),
				]),
			}),
		]));
	});
});
