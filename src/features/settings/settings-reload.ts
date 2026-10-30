/**
 * Settings reload orchestration for the external-settings-change lifecycle hook.
 *
 * Extracted from the plugin class so the reload sequence triggered by
 * `onExternalSettingsChange()` (Obsidian Sync / external edits to data.json)
 * is unit-testable without constructing a full Plugin instance.
 */

export interface SettingsReloadHost {
	/** Re-read settings from disk into the in-memory settings object. */
	loadSettings(): Promise<void>;
	/** Drop cached, settings-derived runtime services so they rebuild lazily. */
	invalidateDerivedState(): void;
	/** Push refreshed settings into any open chat views (model pickers, etc.). */
	refreshChatViewsModels(): Promise<void>;
	/** Connect, disconnect and reload tool sources to match the reloaded settings. */
	reloadToolSources(): Promise<void>;
	/** Repaint settings-derived UI (e.g. the status bar). */
	refreshStatusBar(): void;
}

/**
 * Run the full reload sequence. Each step is best-effort so a failure in one
 * (e.g. a chat view refresh) never aborts the settings reload itself.
 */
export async function reloadSettingsFromDisk(host: SettingsReloadHost): Promise<void> {
	await host.loadSettings();
	host.invalidateDerivedState();
	try {
		await host.refreshChatViewsModels();
	} catch (error) {
		console.error('[Plugin] refreshChatViewsModels after external change failed:', error);
	}
	try {
		await host.reloadToolSources();
	} catch (error) {
		console.error('[Plugin] reloadToolSources after external change failed:', error);
	}
	host.refreshStatusBar();
}
