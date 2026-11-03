import { ChatViewPage } from '../../../pages/chat/chat-view.page';
import { ChatReplyPage } from '../../../pages/chat/chat-reply.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { ollamaModels, seedOllama, skipUnlessOllama } from '../../../support/ollama-env';

describe('UX review: chat feedback', function () {
	this.timeout(1_200_000);
	const chat = new ChatViewPage();
	const reply = new ChatReplyPage();
	const probe = new UxProbePage();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await waitForPluginReady();
		await seedOllama();
		await chat.openInSidebar();
		await chat.selectMode('chat');
		await chat.selectModel(`ollama:${ollamaModels.chat}`);
		await reply.allowReplyTokens(8_000);
		const prompts = [
			'Reply with only a Python code block containing print("hello"). /no_think',
			'Reply with exactly ONE. /no_think',
			'Reply with exactly TWO. /no_think',
			'Reply with exactly THREE. /no_think',
		];
		for (const [index, prompt] of prompts.entries()) {
			await chat.sendMessage(prompt);
			await reply.waitForReplies(index + 1, 240_000);
		}
	});

	it('P2 the scroll-to-bottom button does not cover the composer', async () => {
		expect(await reply.messagesOverflow()).toBe(true);
		await reply.scrollMessagesToTop();
		await probe.capture('p2-scroll-button');

		expect(await probe.isVisible('.mod-right-split .ia-scroll-to-bottom')).toBe(true);
		expect(await probe.overlaps('.mod-right-split .ia-scroll-to-bottom', '.mod-right-split .chat-input-box')).toBe(false);
	});

	it('P2 copying a code block says the code was copied', async () => {
		await reply.copyFirstCodeBlock();

		expect(await reply.firstCodeCopyLabel()).not.toMatch(/message/i);
	});

	it('P2 the tools and permissions dialog sets labels apart from their values', async () => {
		await chat.openCapabilities();
		await probe.capture('p2-capabilities');

		const [label, value] = await probe.computedStyles(['.ia-agent-capability-row__label', '.ia-agent-capability-row__value'], ['color', 'font-weight']);
		expect(`${label.color} ${label['font-weight']}`).not.toBe(`${value.color} ${value['font-weight']}`);
	});
});
