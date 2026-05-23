export class ToolsTabPage {
	async clickRefreshAllTools(): Promise<void> {
		const btn = await $('button=Refresh all tools');
		await btn.click();
	}

	async toggleBuiltinTool(index: number): Promise<void> {
		const toggles = await $$('.checkbox-container');
		if (index < toggles.length) await toggles[index].click();
	}

	async getBuiltinToolNames(): Promise<string[]> {
		const items = await $$('.setting-item-name');
		const names: string[] = [];
		for (const item of items) {
			names.push(await item.getText());
		}
		return names;
	}

	/** Navigate to the OpenAPI sub-tab under Tools */
	async navigateToOpenApi(): Promise<void> {
		const tab = await $('*=OpenAPI');
		await tab.click();
		await browser.pause(300);
	}

	/** Navigate to the CLI sub-tab under Tools */
	async navigateToCli(): Promise<void> {
		const tab = await $('*=CLI');
		await tab.click();
		await browser.pause(300);
	}
}
