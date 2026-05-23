export class PromptsTabPage {
	private get addPromptBtn() { return $('button=Add prompt'); }

	async clickAddPrompt(): Promise<void> {
		await this.addPromptBtn.click();
		await browser.pause(300);
	}

	async getPromptCount(): Promise<number> {
		const items = await $$('.setting-item');
		return items.length;
	}
}
