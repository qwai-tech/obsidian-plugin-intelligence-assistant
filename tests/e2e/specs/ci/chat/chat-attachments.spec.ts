import { ChatViewPage } from '../../../pages/chat-view.page';

describe('Chat - Attachments', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		chatPage = new ChatViewPage();
		await chatPage.open();
		await chatPage.newChat();
	});

	it('should have RAG toggle button visible', async () => {
		const btnExists = await $('button[title*="RAG"]').isDisplayed();
		expect(btnExists).toBe(true);
	});

	it('should have web search toggle button visible', async () => {
		const btnExists = await $('button[title*="Web"]').isDisplayed();
		expect(btnExists).toBe(true);
	});

	it('should have send button enabled initially', async () => {
		const enabled = await chatPage.isSendEnabled();
		expect(enabled).toBe(true);
	});
});
