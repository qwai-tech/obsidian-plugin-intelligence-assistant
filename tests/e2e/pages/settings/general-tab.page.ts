export class GeneralTabPage {
	async getDefaultMode(): Promise<string> {
		const sel = await $('select.setting-item select');
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
