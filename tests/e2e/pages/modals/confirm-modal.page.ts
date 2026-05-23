export class ConfirmModalPage {
	private get modal() { return $('.modal'); }

	async isOpen(): Promise<boolean> {
		return this.modal.isDisplayed().catch(() => false);
	}

	async getTitle(): Promise<string> {
		const h2 = await $('.modal h2');
		return h2.getText();
	}

	async confirm(): Promise<void> {
		const btns = await $$('.modal button');
		for (const btn of btns) {
			const text = await btn.getText();
			if (text.includes('Delete') || text.includes('Confirm') || text.includes('OK')) {
				await btn.click();
				return;
			}
		}
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
