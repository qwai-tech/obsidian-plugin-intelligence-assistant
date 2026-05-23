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

export class QuickActionsTabPage {
	async clickAddAction(): Promise<void> {
		const btn = await findButtonByText('Add');
		await btn.click();
		await browser.pause(300);
	}

	async getActionCount(): Promise<number> {
		const items = await $$('.setting-item');
		return items.length;
	}
}
