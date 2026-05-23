/** Find a clickable element by partial text match — searches buttons and ia-button styled elements. */
async function findButtonByText(text: string): Promise<WebdriverIO.Element> {
	const selectors = ['button.ia-button', '.ia-button', 'button'];
	for (const sel of selectors) {
		const elements = await $$(sel);
		for (const el of elements) {
			try {
				const elText = await el.getText();
				if (elText && elText.toLowerCase().includes(text.toLowerCase())) {
					return el;
				}
			} catch { /* element may be stale, skip */ }
		}
	}
	throw new Error(`Button containing "${text}" not found`);
}

/** Find a sub-tab nav button by text. */
async function findTabByText(text: string): Promise<WebdriverIO.Element> {
	const elements = await $$('.settings-tab');
	for (const el of elements) {
		const elText = await el.getText();
		if (elText.toLowerCase().includes(text.toLowerCase())) {
			return el;
		}
	}
	// fallback
	for (const sel of ['button', '.setting-item-name']) {
		const all = await $$(sel);
		for (const el of all) {
			const elText = await el.getText();
			if (elText.toLowerCase().includes(text.toLowerCase())) {
				return el;
			}
		}
	}
	throw new Error(`Tab containing "${text}" not found`);
}

export class LLMTabPage {
	async clickAddProvider(): Promise<void> {
		const btn = await findButtonByText('add');
		await btn.click();
		await browser.pause(500);
	}

	async getProviderCount(): Promise<number> {
		const items = await $$('.setting-item');
		return items.length;
	}

	async getProviderByName(name: string): Promise<WebdriverIO.Element | null> {
		const items = await $$('.setting-item');
		for (const item of items) {
			const text = await item.getText();
			if (text.includes(name)) return item;
		}
		return null;
	}

	async clickRefreshModels(): Promise<void> {
		const btn = await findButtonByText('refresh');
		await btn.click();
	}

	async navigateToModelsTab(): Promise<void> {
		const tab = await findTabByText('model');
		await tab.click();
		await browser.pause(300);
	}
}
