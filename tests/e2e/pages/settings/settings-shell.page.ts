/**
 * Page Object for the Obsidian settings shell.
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

	async openPluginSettings(): Promise<void> {
		await this.open();

		// Wait for the settings sidebar tabs to render
		const sidebar = await $('.vertical-tab-header');
		await sidebar.waitForDisplayed({ timeout: 5000 });

		// Scroll through all tabs to find the plugin's tab
		const tabs = await $$('.vertical-tab-header-item');
		for (const tab of tabs) {
			// Scroll the tab into view in case it's off-screen
			await tab.scrollIntoView();
			await browser.pause(100);
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
		// Try clicking sub-tab headers inside the plugin's own tab navigation
		const headers = await $$('.settings-tabs .setting-item');
		for (const h of headers) {
			const text = await h.getText();
			if (text.includes(tabName)) {
				await h.click();
				await browser.pause(300);
				return;
			}
		}
		// Fallback: try any setting-item-name
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
