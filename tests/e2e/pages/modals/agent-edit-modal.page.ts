export class AgentEditModalPage {
	private get modal() { return $('.modal'); }
	private get saveBtn() { return $('.modal button.mod-cta'); }

	async isOpen(): Promise<boolean> {
		return this.modal.isDisplayed().catch(() => false);
	}

	async setName(name: string): Promise<void> {
		const inputs = await $$('.modal input[type="text"]');
		if (inputs.length > 0) await inputs[0].setValue(name);
	}

	async setDescription(desc: string): Promise<void> {
		const textareas = await $$('.modal textarea');
		if (textareas.length > 0) await textareas[0].setValue(desc);
	}

	async getToolAccessSummary(): Promise<string> {
		const modalText = await this.modal.getText();
		const start = modalText.indexOf('Tool Access');
		if (start === -1) return '';
		return modalText.substring(start, start + 200);
	}

	async save(): Promise<void> {
		await this.saveBtn.click();
		await browser.pause(500);
	}

	async cancel(): Promise<void> {
		const btns = await $$('.modal button');
		for (const btn of btns) {
			const text = await btn.getText();
			if (text.includes('Cancel')) {
				await btn.click();
				return;
			}
		}
	}
}
