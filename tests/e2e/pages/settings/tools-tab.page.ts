export class ToolsTabPage {
	async clickRefreshAllTools(): Promise<void> {
		const btn = await $('button=Refresh all tools');
		await btn.click();
	}

	async toggleBuiltinTool(index: number): Promise<void> {
		const items = await $$('.setting-item');
		const toolItems: WebdriverIO.Element[] = [];
		for (const item of items) {
			const text = await item.getText();
			if (text.includes('read_file') || text.includes('write_file')
				|| text.includes('list_files') || text.includes('search_files')
				|| text.includes('create_note') || text.includes('append_to_note')) {
				toolItems.push(item);
			}
		}
		if (index < toolItems.length) {
			const checkbox = await toolItems[index].$('.checkbox-container');
			if (checkbox) await checkbox.click();
		}
	}

	async getBuiltinToolNames(): Promise<string[]> {
		const items = await $$('.setting-item');
		const names: string[] = [];
		for (const item of items) {
			const text = await item.getText();
			if (text.includes('read_file') || text.includes('write_file')
				|| text.includes('list_files') || text.includes('search_files')
				|| text.includes('create_note') || text.includes('append_to_note')) {
				names.push(text.split('\n')[0] || text.substring(0, 40));
			}
		}
		return names;
	}

	/** Navigate to a Tools sub-tab by clicking the .settings-tab button. */
	async navigateToSubTab(labelPattern: string): Promise<void> {
		const buttons = await $$('.settings-tab');
		for (const btn of buttons) {
			const text = await btn.getText();
			if (text.toLowerCase().includes(labelPattern.toLowerCase())) {
				await btn.click();
				await browser.pause(300);
				return;
			}
		}
	}

	async navigateToOpenApi(): Promise<void> {
		await this.navigateToSubTab('openapi');
	}

	async navigateToCli(): Promise<void> {
		await this.navigateToSubTab('cli');
	}
}
