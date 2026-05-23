/**
 * General E2E test helpers.
 */

/** Wait for the Obsidian plugin to fully load. */
export async function waitForPluginReady(): Promise<void> {
	await browser.pause(2000);
}

/** Open the plugin settings modal. */
export async function openSettings(): Promise<void> {
	// Obsidian settings are opened via the command palette or ribbon
	await browser.execute(() => {
		const app = (window as any).app;
		app.setting.open();
	});
	await browser.pause(500);
}

/** Navigate to a specific settings tab. */
export async function navigateToSettingsTab(tabText: string): Promise<void> {
	const tabs = await $$('.vertical-tab-header-item');
	for (const tab of tabs) {
		const text = await tab.getText();
		if (text.includes(tabText)) {
			await tab.click();
			await browser.pause(300);
			return;
		}
	}
	throw new Error(`Settings tab "${tabText}" not found`);
}

/** Open the chat view in the Obsidian workspace. */
export async function openChatView(): Promise<void> {
	await browser.execute(() => {
		const app = (window as any).app;
		const leaves = app.workspace.getLeavesOfType('intelligence-assistant-chat');
		if (leaves.length === 0) {
			app.workspace.getLeaf('tab').setViewState({
				type: 'intelligence-assistant-chat',
				active: true,
			});
		} else {
			app.workspace.setActiveLeaf(leaves[0]);
		}
	});
	await browser.pause(1000);
}
