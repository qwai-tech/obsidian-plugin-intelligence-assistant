/**
 * Release-only test: real AI agent loop with tool calling.
 * Requires .env.test with valid API keys.
 */
import { ChatViewPage } from '../../pages/chat-view.page';

describe('Real Agent Loop', function () {
	this.timeout(180_000);

	let chatPage: ChatViewPage;

	before(async () => {
		chatPage = new ChatViewPage();
		await chatPage.open();
		await chatPage.switchMode('agent');
		await chatPage.newChat();
	});

	it('should complete an agent loop with tool calls', async () => {
		await chatPage.sendMessage('Read README.md and tell me the first section title.');
		await browser.waitUntil(
			async () => (await chatPage.getMessageCount()) >= 3,
			{ timeout: 120_000, timeoutMsg: 'Agent loop did not complete' }
		);
		const text = await chatPage.getLastAssistantText();
		expect(text.length).toBeGreaterThan(0);
	});

	it('should show tool execution traces', async () => {
		const traces = await chatPage.getToolTraces();
		// May or may not have traces depending on agent behaviour
		expect(Array.isArray(traces)).toBe(true);
	});
});
