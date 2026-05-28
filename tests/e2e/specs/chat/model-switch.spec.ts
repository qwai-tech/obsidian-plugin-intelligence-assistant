import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

describe('Chat model switch', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('uses the selected model for the next chat request', async () => {
		await chat.selectModel('gpt-4o-mini-alt');
		await expect(await chat.getSelectedModel()).toBe('gpt-4o-mini-alt');
		await mockLLM.replyWith('alt model reply');

		await chat.sendMessage('use the alternate model');
		await chat.waitForReplyComplete();

		const messages = await chat.getMessages();
		await expect(messages).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('use the alternate model') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('alt model reply') }),
		]);

		const calls = await mockLLM.getCalls();
		const chatCalls = calls.filter((call) => {
			const body = call.body as { stream?: boolean } | null;
			return body?.stream === true;
		});
		await expect(chatCalls).toHaveLength(1);
		await expect(chatCalls[0].body).toMatchObject({ model: 'gpt-4o-mini-alt' });
	});
});
