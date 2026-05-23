import { ChatViewPage } from '../../../pages/chat-view.page';
import { mockOpenAISimpleReply } from '../../../utils/mock-ai';

describe('Security - Filesystem Boundary', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		mockOpenAISimpleReply();
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	it('should not crash when attempting to read outside vault', async () => {
		await chatPage.newChat();
		await chatPage.sendMessage('Read file ../../.git/config');
		await browser.pause(1000);
		const isOpen = await chatPage.isOpen();
		expect(isOpen).toBe(true);
	});
});
