/// <reference types="mocha" />
/// <reference types="@wdio/globals/types" />
/**
 * Phase 0 acceptance gate (foundation-only).
 *
 * What would break if this test stays green when the feature breaks?
 *   - Plugin fails to load into Obsidian (waitForPluginReady would hang)
 *   - VaultFixture doesn't restore state from the template
 *   - Chat view doesn't open, or any of its anchor testids
 *     (container/input/send/empty-state/model-select/mode-select)
 *     are missing from the source
 *
 * This spec also covers the minimal mocked chat round-trip so the
 * CI foundation catches broken LLM request, render, and persistence paths.
 */
import { ChatViewPage } from '../pages/chat/chat-view.page';
import { VaultFixture } from '../support/vault-fixture';
import { waitForPluginReady } from '../support/plugin-helpers';
import { mockLLM } from '../support/mock-llm';

interface SeededSettings {
	providers: {
		defaultModel: string;
		list: Array<{ provider: string; apiKey: string }>;
	};
}

describe('Smoke — plugin loads, chat view + settings shell render', () => {
	const vault = new VaultFixture();
	const chat = new ChatViewPage();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
	});

	it('mounts the plugin and its main chat view with all expected testids', async () => {
		await chat.open();
		await chat.newChat();

		await expect(await chat.isContainerVisible()).toBe(true);
		await expect(await chat.isInputVisible()).toBe(true);
		await expect(await chat.isSendBtnPresent()).toBe(true);
		await expect(await chat.isEmptyStateVisible()).toBe(true);
		await expect(await chat.isModelSelectPresent()).toBe(true);
		await expect(await chat.isModeSelectPresent()).toBe(true);
	});

	it('resets vault state between specs (settings.json restored from template)', async () => {
		const settings = await vault.readDataFile<SeededSettings>('config/user/settings.json');
		await expect(settings.providers.defaultModel).toBe('gpt-4o-mini');
		await expect(settings.providers.list).toHaveLength(1);
		await expect(settings.providers.list[0].provider).toBe('openai');
		await expect(settings.providers.list[0].apiKey).toBe('sk-test-fixture');
	});

	it('sends a mocked chat round-trip and persists the conversation', async () => {
		await chat.open();
		await chat.newChat();
		await mockLLM.replyWith('pong');

		await chat.sendMessage('ping');
		await chat.waitForReplyComplete();

		const messages = await chat.getMessages();
		expect(messages).toEqual([
			expect.objectContaining({ role: 'user', text: expect.stringContaining('ping') }),
			expect.objectContaining({ role: 'assistant', text: expect.stringContaining('pong') }),
		]);

		const conversationId = await chat.getConversationId();
		expect(conversationId).not.toBe('');
		const conversationPath = await vault.findRuntimeConversationFile(conversationId);
		const conversation = await vault.readRuntimeDataFile<{ messages: Array<{ role: string; content: string }> }>(conversationPath);
		expect(conversation.messages).toEqual([
			expect.objectContaining({ role: 'user', content: expect.stringContaining('ping') }),
			expect.objectContaining({ role: 'assistant', content: expect.stringContaining('pong') }),
		]);

		const calls = await mockLLM.getCalls();
		const chatCalls = calls.filter((call) => {
			const body = call.body as { stream?: boolean } | null;
			return body?.stream === true;
		});
		expect(chatCalls).toHaveLength(1);
		expect(chatCalls[0].body).toMatchObject({ model: 'gpt-4o-mini' });
	});
});
