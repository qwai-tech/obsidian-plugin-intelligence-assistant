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
 * What this spec deliberately does NOT cover yet:
 *   - Sending a message and asserting on an assistant reply. browser.mock
 *     requires WebDriver Bidi, which is currently incompatible with
 *     wdio-obsidian-service. LLM-mocked round-trip tests land in Phase 1
 *     via a different strategy (fetch monkey-patch or a local stub HTTP
 *     server). The Release suite covers the real-API round-trip.
 */
import { ChatViewPage } from '../pages/chat/chat-view.page';
import { VaultFixture } from '../support/vault-fixture';
import { waitForPluginReady } from '../support/plugin-helpers';

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
});
