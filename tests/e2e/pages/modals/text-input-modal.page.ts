export class TextInputModalPage {
	private get modal() { return $('.modal'); }
	private get input() { return $('.modal input[type="text"]'); }
	private get saveBtn() { return $('.modal button.mod-cta'); }

	async isOpen(): Promise<boolean> {
		return this.modal.isDisplayed().catch(() => false);
	}

	async setText(text: string): Promise<void> {
		await this.input.setValue(text);
	}

	async save(): Promise<void> {
		await this.saveBtn.click();
		await browser.pause(300);
	}
}
