/** Find a button by partial text match. */
async function findButtonByText(text: string): Promise<WebdriverIO.Element> {
	const buttons = await $$('button');
	for (const btn of buttons) {
		const btnText = await btn.getText();
		if (btnText.toLowerCase().includes(text.toLowerCase())) {
			return btn;
		}
	}
	throw new Error(`Button containing "${text}" not found`);
}

/** Find a .setting-item-name element by partial text match. */
async function findSettingItemByName(text: string): Promise<WebdriverIO.Element> {
	const items = await $$('.setting-item-name');
	for (const item of items) {
		const itemText = await item.getText();
		if (itemText.toLowerCase().includes(text.toLowerCase())) {
			return item;
		}
	}
	throw new Error(`Setting item containing "${text}" not found`);
}

export class LLMTabPage {
	private get providerRows() { return $$('.setting-item'); }

	async clickAddProvider(): Promise<void> {
		const btn = await findButtonByText('Add');
		await btn.click();
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
		const btn = await findButtonByText('Refresh');
		await btn.click();
	}

	async navigateToModelsTab(): Promise<void> {
		const tab = await findSettingItemByName('Models');
		await tab.click();
		await browser.pause(300);
	}
}
