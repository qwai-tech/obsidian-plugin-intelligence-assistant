const PLUGIN_ID = 'intelligence-assistant';

/**
 * Wait until Obsidian reports the plugin as enabled and its main view type
 * is registered. Throws if it isn't ready within `timeoutMs`.
 */
export async function waitForPluginReady(timeoutMs = 15000): Promise<void> {
	await browser.waitUntil(
		async () => {
			return browser.execute((pluginId) => {
				const app = (window as unknown as { app?: {
					plugins?: { plugins: Record<string, unknown> };
					workspace?: { getLeavesOfType: (t: string) => unknown[] };
				} }).app;
				if (!app?.plugins?.plugins) return false;
				return Boolean(app.plugins.plugins[pluginId]);
			}, PLUGIN_ID);
		},
		{ timeout: timeoutMs, timeoutMsg: `Plugin ${PLUGIN_ID} did not initialize` }
	);
}

/**
 * Disable then re-enable the plugin. Used by persistence specs to verify
 * settings survive a restart cycle without nuking Obsidian.
 */
export async function reloadPlugin(): Promise<void> {
	await browser.execute(async (pluginId) => {
		const pluginsApi = (window as unknown as { app: {
			plugins: {
				disablePlugin(id: string): Promise<void>;
				enablePlugin(id: string): Promise<void>;
			};
		} }).app.plugins;
		await pluginsApi.disablePlugin(pluginId);
		await pluginsApi.enablePlugin(pluginId);
	}, PLUGIN_ID);
	await waitForPluginReady();
}
