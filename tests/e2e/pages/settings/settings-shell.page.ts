/**
 * Page Object for the Obsidian settings shell.
 */
export class SettingsShellPage {
	private get modal() { return $('.modal-container'); }
	private get pluginTab() { return $('.vertical-tab-header-item=Intelligence Assistant'); }

	async open(): Promise<void> {
		await browser.execute(() => {
			(window as any).app.setting.open();
		});
		await browser.pause(500);
	}

	async close(): Promise<void> {
		await browser.keys('Escape');
	}

	async openPluginSettings(): Promise<void> {
		await this.open();
		const tab = await $('.vertical-tab-header-item');
		const tabs = await $$('.vertical-tab-header-item');
		for (const t of tabs) {
			const text = await t.getText();
			if (text.includes('Intelligence Assistant')) {
				await t.click();
				await browser.pause(300);
				return;
			}
		}
		throw new Error('Plugin settings tab not found');
	}

	async navigateToTab(tabName: string): Promise<void> {
		const headers = await $$('.vertical-tab-header-item');
		for (const h of headers) {
			const text = await h.getText();
			if (text.includes(tabName)) {
				await h.click();
				await browser.pause(300);
				return;
			}
		}
		// Try nested tab headers
		const nested = await $$('.setting-item-name');
		for (const n of nested) {
			const text = await n.getText();
			if (text.includes(tabName)) {
				await n.click();
				await browser.pause(300);
				return;
			}
		}
	}
}
