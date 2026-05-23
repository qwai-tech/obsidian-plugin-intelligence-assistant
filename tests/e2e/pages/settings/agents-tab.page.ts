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

export class AgentsTabPage {
	async clickAddAgent(): Promise<void> {
		const btn = await findButtonByText('Add');
		await btn.click();
		await browser.pause(500);
	}

	async getAgentCount(): Promise<number> {
		const items = await $$('.setting-item');
		return items.length;
	}

	async getAgentByName(name: string): Promise<WebdriverIO.Element | null> {
		const items = await $$('.setting-item');
		for (const item of items) {
			const text = await item.getText();
			if (text.includes(name)) return item;
		}
		return null;
	}
}
