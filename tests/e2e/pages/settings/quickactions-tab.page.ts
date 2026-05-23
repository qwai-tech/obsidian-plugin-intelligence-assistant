export class QuickActionsTabPage {
	private get addActionBtn() { return $('button=Add action'); }

	async clickAddAction(): Promise<void> {
		await this.addActionBtn.click();
		await browser.pause(300);
	}

	async getActionCount(): Promise<number> {
		const items = await $$('.setting-item');
		return items.length;
	}
}
