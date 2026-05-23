/**
 * Page Object for the floating conversation list sidebar.
 */
export class ConversationListPage {
	private get container() { return $('.conversation-list-floating'); }
	private get items() { return $$('.ia-conversation-item'); }
	private get searchInput() { return $('.conversation-list-floating input'); }

	async open(): Promise<void> {
		const btn = await $('button[title*="Conversation"]');
		await btn.click();
		await this.container.waitForDisplayed({ timeout: 5000 });
	}

	async close(): Promise<void> {
		await browser.keys('Escape');
		await browser.pause(300);
	}

	async isOpen(): Promise<boolean> {
		return this.container.isDisplayed().catch(() => false);
	}

	async getCount(): Promise<number> {
		return this.items.length;
	}

	async selectConversation(index: number): Promise<void> {
		const all = await this.items;
		if (index < all.length) await all[index].click();
	}

	async getConversationTitle(index: number): Promise<string> {
		const all = await this.items;
		if (index < all.length) {
			const title = await all[index].$('.ia-conversation-title');
			return title ? title.getText() : '';
		}
		return '';
	}

	async deleteConversation(index: number): Promise<void> {
		const all = await this.items;
		if (index < all.length) {
			const btn = await all[index].$('button[aria-label*="Delete"]');
			if (btn) await btn.click();
		}
	}

	async search(text: string): Promise<void> {
		await this.searchInput.setValue(text);
	}
}
