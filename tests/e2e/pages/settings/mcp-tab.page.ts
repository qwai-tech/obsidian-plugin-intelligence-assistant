export class MCPTabPage {
	private get addServerBtn() { return $('button=Add server'); }
	private get refreshAllBtn() { return $('button=Refresh all tools'); }

	async clickAddServer(): Promise<void> {
		await this.addServerBtn.click();
		await browser.pause(500);
	}

	async clickRefreshAllTools(): Promise<void> {
		await this.refreshAllBtn.click();
		await browser.pause(1000);
	}

	async getServerCount(): Promise<number> {
		const items = await $$('.setting-item');
		return items.length;
	}

	async getServerByName(name: string): Promise<WebdriverIO.Element | null> {
		const items = await $$('.setting-item');
		for (const item of items) {
			const text = await item.getText();
			if (text.includes(name)) return item;
		}
		return null;
	}
}
