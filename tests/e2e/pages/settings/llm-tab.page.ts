export class LLMTabPage {
	private get addProviderBtn() { return $('button=Add provider'); }
	private get providerRows() { return $$('.setting-item'); }

	async clickAddProvider(): Promise<void> {
		await this.addProviderBtn.click();
		await browser.pause(500);
	}

	async getProviderCount(): Promise<number> {
		return this.providerRows.length;
	}

	async getProviderByName(name: string): Promise<WebdriverIO.Element | null> {
		const rows = await this.providerRows;
		for (const row of rows) {
			const text = await row.getText();
			if (text.includes(name)) return row;
		}
		return null;
	}

	async clickRefreshModels(): Promise<void> {
		const btn = await $('button=Refresh all models');
		await btn.click();
	}

	async navigateToModelsTab(): Promise<void> {
		const tab = await $('.setting-item-name=Models');
		await tab.click();
		await browser.pause(300);
	}
}
