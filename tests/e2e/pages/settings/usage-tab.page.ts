export class UsageTabPage {
	async getUsageSummary(): Promise<string> {
		const container = await $('.vertical-tab-content-container');
		return container.getText();
	}

	async getTokenCount(): Promise<string> {
		const text = await this.getUsageSummary();
		const match = text.match(/[\d,]+ tokens/i);
		return match ? match[0] : '';
	}
}
