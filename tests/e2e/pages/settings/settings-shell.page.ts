/**
 * Page Object for the Obsidian settings shell.
 *
 * Uses Obsidian's internal API (app.setting) to navigate reliably.
 * DOM-based tab clicking is unreliable because community plugin tabs
 * may be inside collapsible sections or scrolled out of view.
 */
export class SettingsShellPage {
	async open(): Promise<void> {
		await browser.execute(() => {
			(window as any).app.setting.open();
		});
		await browser.pause(800);
	}

	async close(): Promise<void> {
		await browser.keys('Escape');
		await browser.pause(300);
	}

	/**
	 * Open the plugin's settings tab using Obsidian's internal API.
	 * Tries the setting.activeTab approach first, then falls back to
	 * the openTabById approach, then to DOM clicking.
	 */
	async openPluginSettings(): Promise<void> {
		await this.open();

		// Try using Obsidian's internal API to activate the plugin tab
		const found = await browser.execute(() => {
			const app = (window as any).app;
			const setting = app.setting;
			if (!setting) return false;

			// The plugin's setting tab ID is the plugin ID
			const pluginId = 'intelligence-assistant';

			// Method 1: try openTabById
			if (typeof setting.openTabById === 'function') {
				setting.openTabById(pluginId);
				return true;
			}

			// Method 2: iterate settingTabs
			if (setting.settingTabs) {
				for (const st of setting.settingTabs) {
					if (st.id === pluginId || (st.name && st.name.toLowerCase().includes('intelligence'))) {
						setting.activeTab = st;
						return true;
					}
				}
			}

			return false;
		});

		if (found) {
			await browser.pause(500);
			return;
		}

		// Fallback: scroll and search DOM
		const tabs = await $$('.vertical-tab-header-item');
		for (const tab of tabs) {
			await tab.scrollIntoView();
			await browser.pause(50);
			const text = await tab.getText();
			if (text.includes('Intelligence')) {
				await tab.click();
				await browser.pause(500);
				return;
			}
		}

		throw new Error('Plugin settings tab not found');
	}

	async navigateToTab(tabName: string): Promise<void> {
		// Try the plugin's own sub-tab navigation first
		const headers = await $$('.settings-tabs .setting-item');
		for (const h of headers) {
			const text = await h.getText();
			if (text.includes(tabName)) {
				await h.click();
				await browser.pause(300);
				return;
			}
		}
		// Fallback: any setting-item-name
		const items = await $$('.setting-item-name');
		for (const item of items) {
			const text = await item.getText();
			if (text.includes(tabName)) {
				await item.click();
				await browser.pause(300);
				return;
			}
		}
	}
}
