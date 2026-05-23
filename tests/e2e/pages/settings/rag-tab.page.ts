export class RAGTabPage {
	async toggleRagEnabled(): Promise<void> {
		const toggle = await $('.checkbox-container');
		await toggle.click();
	}

	async isRagEnabled(): Promise<boolean> {
		const input = await $('.checkbox-container input');
		return input.getAttribute('checked') !== null;
	}

	async navigateToSubTab(name: string): Promise<void> {
		const tabs = await $$('.setting-item-name');
		for (const tab of tabs) {
			const text = await tab.getText();
			if (text.includes(name)) {
				await tab.click();
				await browser.pause(300);
				return;
			}
		}
	}
}
