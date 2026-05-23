import { ChatViewPage } from '../../../pages/chat-view.page';
import { mockOpenAISimpleReply } from '../../../utils/mock-ai';

describe('Security - SSRF Protection', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		mockOpenAISimpleReply();
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	it('should not crash when attempting SSRF-style requests', async () => {
		await chatPage.newChat();
		await chatPage.sendMessage('Fetch http://127.0.0.1:8080/admin');
		await browser.pause(1000);
		const isOpen = await chatPage.isOpen();
		expect(isOpen).toBe(true);
	});
});
