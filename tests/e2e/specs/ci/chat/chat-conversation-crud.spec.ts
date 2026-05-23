import { ChatViewPage } from '../../../pages/chat-view.page';
import { ConversationListPage } from '../../../pages/conversation-list.page';
import { mockOpenAISimpleReply } from '../../../utils/mock-ai';

describe('Chat - Conversation CRUD', () => {
	let chatPage: ChatViewPage;
	let convPage: ConversationListPage;

	before(async () => {
		mockOpenAISimpleReply();
		chatPage = new ChatViewPage();
		convPage = new ConversationListPage();
		await chatPage.open();
	});

	it('should create a conversation by sending a message', async () => {
		await chatPage.newChat();
		await chatPage.sendMessage('First message');
		await chatPage.waitForReply(15000);
		const count = await chatPage.getMessageCount();
		expect(count).toBeGreaterThanOrEqual(2);
	});

	it('should open the conversation list', async () => {
		await convPage.open();
		const isOpen = await convPage.isOpen();
		expect(isOpen).toBe(true);
	});

	it('should create a new chat and send a different message', async () => {
		await chatPage.newChat();
		await chatPage.sendMessage('Second conversation');
		await chatPage.waitForReply(15000);
		const count = await chatPage.getMessageCount();
		expect(count).toBeGreaterThanOrEqual(2);
	});
});
