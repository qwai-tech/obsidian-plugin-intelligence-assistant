export class MCPServerModalPage {
	private get modal() { return $('.modal'); }
	private get saveBtn() { return $('.modal button.mod-cta'); }

	async isOpen(): Promise<boolean> {
		return this.modal.isDisplayed().catch(() => false);
	}

	async setName(name: string): Promise<void> {
		const inputs = await $$('.modal input[type="text"]');
		if (inputs.length > 0) await inputs[0].setValue(name);
	}

	async setCommand(command: string): Promise<void> {
		const inputs = await $$('.modal input[type="text"]');
		if (inputs.length > 1) await inputs[1].setValue(command);
	}

	async setArgs(args: string): Promise<void> {
		const inputs = await $$('.modal input[type="text"]');
		if (inputs.length > 2) await inputs[2].setValue(args);
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
				await browser.pause(300);
				return;
			}
		}
	}
}
