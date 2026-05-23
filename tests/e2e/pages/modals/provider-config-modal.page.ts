export class ProviderConfigModalPage {
	private get modal() { return $('.modal'); }
	private get saveBtn() { return $('.modal button.mod-cta'); }

	async isOpen(): Promise<boolean> {
		return this.modal.isDisplayed().catch(() => false);
	}

	async setName(name: string): Promise<void> {
		const input = await $('.modal input[type="text"]');
		await input.setValue(name);
	}

	async setApiKey(key: string): Promise<void> {
		const inputs = await $$('.modal input[type="password"]');
		if (inputs.length > 0) await inputs[0].setValue(key);
	}

	async getApiKeyInputType(): Promise<string> {
		const inputs = await $$('.modal input[type="password"]');
		if (inputs.length > 0) return inputs[0].getAttribute('type');
		return '';
	}

	async selectProviderType(type: string): Promise<void> {
		const selects = await $$('.modal select');
		if (selects.length > 0) await selects[0].selectByVisibleText(type);
	}

	async setBaseUrl(url: string): Promise<void> {
		const inputs = await $$('.modal input[type="text"]');
		// base URL is usually the second text input after the name
		if (inputs.length > 1) await inputs[1].setValue(url);
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
