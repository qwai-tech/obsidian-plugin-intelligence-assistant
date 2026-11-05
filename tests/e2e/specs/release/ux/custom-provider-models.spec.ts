import { LlmSettingsPage } from '../../../pages/settings/llm-settings.page';
import { ChatViewPage } from '../../../pages/chat/chat-view.page';
import { ChatReplyPage } from '../../../pages/chat/chat-reply.page';
import { ToolsSettingsPage } from '../../../pages/settings/tools-settings.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { skipUnlessOllama } from '../../../support/ollama-env';
import { VaultFixture } from '../../../support/vault-fixture';

describe('UX review: Custom provider model identity', function () {
	this.timeout(600_000);
	const llm = new LlmSettingsPage();
	const chat = new ChatViewPage();
	const reply = new ChatReplyPage();
	const settings = new ToolsSettingsPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async function (this: Mocha.Context) {
		await skipUnlessOllama(this);
		await vault.reset();
		await waitForPluginReady();
	});

	it('#9 lists a Custom provider\'s models under its own provider, not OpenAI\'s', async () => {
		await llm.openProviderTab();
		await llm.openNewProviderForm({ provider: 'custom', baseUrl: 'http://localhost:11434/v1', apiKey: { secret: 'ux-custom-key', value: 'local' } });
		await llm.testConnectionInForm();
		await probe.waitForNotice(text => /successful/i.test(text), 30_000);
		await llm.saveProviderForm('custom');

		const ids = await llm.cachedModelIds('custom');
		expect(ids.some(id => /^custom@[^:]+:qwen3\.5:0\.8b$/.test(id))).toBe(true);
		expect(ids.filter(id => id.startsWith('openai:'))).toEqual([]);
		await settings.closeSettings();
	});

	it('#9 sends a chat with a Custom provider model to that provider', async () => {
		const [model] = (await llm.cachedModelIds('custom')).filter(id => id.endsWith('qwen3.5:0.8b'));
		await chat.open();
		await chat.newChat();
		await chat.selectMode('chat');
		await chat.selectModel(model);
		await reply.allowReplyTokens(8_000);

		await chat.sendMessage('Reply with exactly ROUTE_OK_5521 and nothing else. /no_think');
		await chat.waitForReplyComplete(240_000);

		const answer = await reply.lastReply();
		expect(answer?.content ?? '').not.toMatch(/error/i);
		expect((answer?.content ?? '').trim()).not.toBe('');
	});
});
