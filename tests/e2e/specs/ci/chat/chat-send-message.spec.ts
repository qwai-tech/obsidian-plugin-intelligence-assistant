import { ChatViewPage } from '../../../pages/chat-view.page';
import { mockOpenAISimpleReply } from '../../../utils/mock-ai';

describe('Chat - Send Message', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		mockOpenAISimpleReply();
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	beforeEach(async () => {
		await chatPage.newChat();
	});

	it('should display user message after sending', async () => {
		await chatPage.sendMessage('Hello');
		const userMsgs = await chatPage.getUserMessages();
		expect(userMsgs.length).toBeGreaterThanOrEqual(1);
	});

	it('should render an assistant reply', async () => {
		await chatPage.sendMessage('Hello');
		await chatPage.waitForReply(15000);
		const text = await chatPage.getLastAssistantText();
		expect(text.length).toBeGreaterThan(0);
	});

	it('should clear messages on new chat', async () => {
		await chatPage.sendMessage('Hello');
		await chatPage.waitForReply(15000);
		await chatPage.newChat();
		const count = await chatPage.getMessageCount();
		expect(count).toBe(0);
	});

	it('should show empty state after new chat', async () => {
		await chatPage.newChat();
		const empty = await chatPage.isEmptyStateVisible();
		expect(empty).toBe(true);
	});
});
