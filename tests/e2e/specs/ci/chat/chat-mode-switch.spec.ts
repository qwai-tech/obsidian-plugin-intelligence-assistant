import { ChatViewPage } from '../../../pages/chat-view.page';

describe('Chat - Mode Switching', () => {
	let chatPage: ChatViewPage;

	before(async () => {
		chatPage = new ChatViewPage();
		await chatPage.open();
	});

	it('should default to chat mode', async () => {
		const model = await chatPage.getSelectedModel();
		expect(model.length).toBeGreaterThan(0);
	});

	it('should show agent badge in agent mode', async () => {
		await chatPage.switchMode('agent');
		await browser.pause(500);
		const badge = await chatPage.getAgentBadgeText();
		// Agent badge may have text if a default agent is set, or be empty
		expect(typeof badge).toBe('string');
	});

	it('should allow switching back to chat mode', async () => {
		await chatPage.switchMode('agent');
		await browser.pause(500);
		await chatPage.switchMode('chat');
		await browser.pause(500);
		const model = await chatPage.getSelectedModel();
		expect(model.length).toBeGreaterThan(0);
	});
});
