export class AgentsTabPage {
	private get addAgentBtn() { return $('button=Add agent'); }

	async clickAddAgent(): Promise<void> {
		await this.addAgentBtn.click();
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
