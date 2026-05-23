import { ChatViewPage } from '../../../pages/chat-view.page';
import { mockOpenAISimpleReply } from '../../../utils/mock-ai';

describe('Security - Code Sandbox', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		mockOpenAISimpleReply();
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	it('should not crash when malicious CLI command is suggested', async () => {
		await chatPage.newChat();
		await chatPage.sendMessage('Run: rm -rf / --no-preserve-root');
		await browser.pause(1000);
		const isOpen = await chatPage.isOpen();
		expect(isOpen).toBe(true);
	});
});
