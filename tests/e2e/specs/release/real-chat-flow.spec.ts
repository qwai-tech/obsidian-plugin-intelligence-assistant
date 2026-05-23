/**
 * Release-only test: real AI chat flow.
 * Requires .env.test with valid API keys.
 */
import { ChatViewPage } from '../../pages/chat-view.page';

describe('Real Chat Flow', function () {
	this.timeout(180_000);

	let chatPage: ChatViewPage;

	before(async () => {
		chatPage = new ChatViewPage();
		await chatPage.open();
		await chatPage.newChat();
	});

	it('should get a real AI reply', async () => {
		await chatPage.sendMessage('Say hello in exactly one sentence.');
		await browser.waitUntil(
			async () => (await chatPage.getAssistantMessages()).length > 0,
			{ timeout: 90_000, timeoutMsg: 'No AI reply received' }
		);
		const text = await chatPage.getLastAssistantText();
		expect(text.length).toBeGreaterThan(0);
	});

	it('should render user and assistant messages correctly', async () => {
		const userMsgs = await chatPage.getUserMessages();
		const assistantMsgs = await chatPage.getAssistantMessages();
		expect(userMsgs.length).toBeGreaterThanOrEqual(1);
		expect(assistantMsgs.length).toBeGreaterThanOrEqual(1);
	});
});
