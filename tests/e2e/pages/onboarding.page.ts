import { BasePage } from './base.page';

const PLUGIN_ID = 'intelligence-assistant';
const LEGACY_SETTINGS_PATH = '.obsidian/plugins/intelligence-assistant/config/user/settings.json';
const PLUGIN_DATA_PATH = '.obsidian/plugins/intelligence-assistant/data.json';

export class OnboardingPage extends BasePage {
	async launchAsFirstRun(): Promise<void> {
		await browser.execute(async (pluginId, paths) => {
			const app = (window as unknown as { app: {
				plugins: { disablePlugin(id: string): Promise<void> };
				vault: { adapter: { exists(p: string): Promise<boolean>; remove(p: string): Promise<void> } };
			} }).app;
			await app.plugins.disablePlugin(pluginId);
			for (const path of paths) {
				if (await app.vault.adapter.exists(path)) await app.vault.adapter.remove(path);
			}
		}, PLUGIN_ID, [LEGACY_SETTINGS_PATH, PLUGIN_DATA_PATH]);
		await browser.execute((pluginId) => {
			const plugins = (window as unknown as { app: { plugins: { enablePlugin(id: string): Promise<void> } } }).app.plugins;
			void plugins.enablePlugin(pluginId);
		}, PLUGIN_ID);
	}

	async welcomeSteps(timeoutMs = 10_000): Promise<string[]> {
		const modal = $('.ia-welcome-modal');
		const shown = await modal.waitForDisplayed({ timeout: timeoutMs }).then(() => true, () => false);
		if (!shown) return [];
		return browser.execute(() => Array.from(activeDocument.querySelectorAll('.ia-welcome-modal ol li')).map(step => (step.textContent ?? '').trim()));
	}

	async waitForPluginSettings(): Promise<void> {
		await $('.vertical-tab-content .setting-item').waitForDisplayed({ timeout: 10_000 });
	}

	async savedLastVersion(): Promise<string | undefined> {
		return browser.execute(async (dataPath) => {
			const adapter = (window as unknown as { app: { vault: { adapter: { exists(p: string): Promise<boolean>; read(p: string): Promise<string> } } } }).app.vault.adapter;
			if (!(await adapter.exists(dataPath))) return undefined;
			return (JSON.parse(await adapter.read(dataPath)) as { config?: { lastVersion?: string } }).config?.lastVersion;
		}, PLUGIN_DATA_PATH);
	}
}
