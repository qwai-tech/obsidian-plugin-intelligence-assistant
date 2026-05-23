/** Find a clickable element by partial text match. */
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
			} catch { /* skip */ }
		}
	}
	throw new Error(`Button containing "${text}" not found`);
}

export class MCPTabPage {
	async clickAddServer(): Promise<void> {
		const btn = await findButtonByText('add');
		await btn.click();
		await browser.pause(500);
	}

	async clickRefreshAllTools(): Promise<void> {
		const btn = await findButtonByText('refresh');
		await btn.click();
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
