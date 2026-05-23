/** Find the first select element. */
async function findSelect(): Promise<WebdriverIO.Element> {
	const selects = await $$('select');
	if (selects.length > 0) return selects[0];
	throw new Error('No select element found');
}

export class GeneralTabPage {
	async getDefaultMode(): Promise<string> {
		const sel = await findSelect();
		return sel ? sel.getValue() : '';
	}

	async setDefaultMode(mode: string): Promise<void> {
		const sel = await $('select');
		await sel.selectByVisibleText(mode);
	}

	async getQuickActionPrefix(): Promise<string> {
		const input = await $('input[placeholder*="prefix"]');
		return input.getValue();
	}
}
