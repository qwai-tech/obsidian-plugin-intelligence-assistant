import { ChatViewPage } from '../../../pages/chat/chat-view.page';
import { ChatReplyPage } from '../../../pages/chat/chat-reply.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { ollamaModels, seedOllama, skipUnlessOllama } from '../../../support/ollama-env';

const COMPOSER = '.mod-right-split .chat-input-box';

describe('UX review: chat composer in the sidebar', () => {
	const chat = new ChatViewPage();
	const reply = new ChatReplyPage();
	const probe = new UxProbePage();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await waitForPluginReady();
		await seedOllama();
		await chat.openInSidebar();
	});

	it('#7 fits every composer control inside the sidebar in chat and agent mode', async () => {
		await chat.selectMode('chat');
		await chat.selectModel(`ollama:${ollamaModels.chat}`);
		await probe.capture('07-sidebar-composer-chat');
		expect(await probe.overflowingChildren(COMPOSER)).toEqual([]);

		await chat.selectMode('agent');
		expect(await probe.overflowingChildren(COMPOSER)).toEqual([]);
	});

	it('#7 keeps the message box usable while a reply is streaming', async function (this: Mocha.Context) {
		this.timeout(300_000);
		await chat.selectMode('chat');
		await chat.selectModel(`ollama:${ollamaModels.chat}`);
		await reply.allowReplyTokens(8_000);
		await chat.sendMessage('Write a long, detailed essay of at least 600 words about keeping notes. /no_think');
		await browser.waitUntil(async () => chat.isStopBtnVisible(), { timeout: 60_000, timeoutMsg: 'Reply did not start streaming' });

		await probe.capture('07-sidebar-composer-streaming');
		const ratio = await probe.widthRatio(`${COMPOSER} textarea`, `${COMPOSER} .chat-input-editor`);
		const overflow = await probe.overflowingChildren(COMPOSER);
		await chat.stopGeneration();

		expect(overflow).toEqual([]);
		expect(ratio).toBeGreaterThan(0.6);
	});
});
