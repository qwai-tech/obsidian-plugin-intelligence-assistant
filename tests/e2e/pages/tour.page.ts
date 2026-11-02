import * as path from 'node:path';
import { BasePage } from './base.page';

export class TourPage extends BasePage {
	theme = 'obsidian';

	constructor(private readonly outDir: string) {
		super();
	}

	async shot(name: string): Promise<void> {
		await this.waitForAnimations();
		await browser.saveScreenshot(path.join(this.outDir, `${this.theme}-${name}.png`));
	}

	async setTheme(theme: string): Promise<void> {
		this.theme = theme;
		await browser.execute((mode) => {
			const app = (window as unknown as { app: { changeTheme(mode: string): void } }).app;
			app.changeTheme(mode);
		}, theme);
	}

	async section(name: string): Promise<void> {
		await this.openSettingsSection(name);
	}

	async settingsRoot(): Promise<void> {
		await this.openPluginSettings();
	}

	async press(id: string): Promise<void> {
		await this.click(id);
	}

	async closeModals(): Promise<void> {
		await browser.keys('Escape');
		await browser.waitUntil(
			async () => browser.execute(() => !activeDocument.querySelector('.modal-container:not(:has(.mod-settings))')),
			{ timeout: 5_000, timeoutMsg: 'Dialog did not close' }
		);
	}

	async openReferencePickerAndFocusFirstResult(): Promise<void> {
		await browser.execute(() => {
			activeDocument.querySelector<HTMLButtonElement>('.chat-input-toolbar-btn.is-link')?.click();
		});
		await $('.searchable-reference-modal [role="option"]').waitForExist({ timeout: 5_000 });
		await browser.execute(() => activeDocument.querySelector<HTMLInputElement>('.searchable-reference-modal input')?.focus());
		await browser.keys('Tab');
		await browser.waitUntil(async () => browser.execute(() => activeDocument.activeElement?.getAttribute('role') === 'option'), {
			timeout: 5_000, timeoutMsg: 'Tab did not reach a reference result',
		});
	}

	async runAgentTaskInSidebar(prompt: string): Promise<void> {
		await browser.execute(async (text) => {
			const app = (window as unknown as { app: { workspace: { detachLeavesOfType(type: string): void } } }).app;
			app.workspace.detachLeavesOfType('intelligence-assistant-chat');
			const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, {
				launcher: { run(task: { prompt: string; displayText: string; newConversation: boolean; sendImmediately: boolean }): Promise<void> };
			}> } } }).app.plugins.plugins['intelligence-assistant'];
			await plugin.launcher.run({ prompt: text, displayText: text, newConversation: true, sendImmediately: true });
		}, prompt);
		await browser.waitUntil(async () => browser.execute(() => Boolean(activeDocument.querySelector('.mod-right-split .ia-agent-preflight-card'))), {
			timeout: 10_000, timeoutMsg: 'Agent task preflight did not appear in the sidebar',
		});
	}

	async closeSettings(): Promise<void> {
		await browser.execute(() => (window as unknown as { app: { setting: { close(): void } } }).app.setting.close());
	}
}
