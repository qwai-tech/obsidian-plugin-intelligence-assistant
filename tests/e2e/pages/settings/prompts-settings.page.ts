import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

type PromptModalValues = {
	name?: string;
	content?: string;
};

export class PromptsSettingsPage extends BasePage {
	async open(): Promise<void> {
		await browser.execute(() => {
			const app = (window as unknown as {
				app: {
					setting: {
						open(): void;
						openTabById(id: string): void;
					};
				};
			}).app;
			app.setting.open();
			app.setting.openTabById('intelligence-assistant');
		});
		await this.waitFor(TestIds.settings.shell);
		await this.clickSettingsTab('prompts');
		await this.waitFor(TestIds.settings.promptAddBtn);
	}

	async addPrompt(): Promise<void> {
		await this.open();
		await this.click(TestIds.settings.promptAddBtn);
		await this.waitForPromptRow('New Prompt');
	}

	async editPrompt(currentName: string, values: PromptModalValues): Promise<void> {
		await this.clickPromptAction(TestIds.settings.promptEditBtn, currentName);
		await this.waitFor(TestIds.settings.promptModalNameInput);
		if (values.name !== undefined) {
			await this.type(TestIds.settings.promptModalNameInput, values.name);
		}
		if (values.content !== undefined) {
			await this.type(TestIds.settings.promptModalContentInput, values.content);
		}
		await this.click(TestIds.settings.promptModalSaveBtn);
		await this.waitForPromptRow(values.name ?? currentName);
	}

	async togglePrompt(name: string): Promise<void> {
		await this.clickPromptAction(TestIds.settings.promptToggleBtn, name);
		await this.waitForPromptRow(name);
	}

	async deletePrompt(name: string): Promise<void> {
		await this.clickPromptAction(TestIds.settings.promptDeleteBtn, name);
		await this.click(TestIds.settings.confirmModalConfirmBtn);
		await this.waitForPromptRow(name, false);
	}

	async waitForPromptRow(name: string, expected = true): Promise<void> {
		await browser.waitUntil(
			async () => this.promptRowExists(name).then(exists => exists === expected),
			{ timeout: 10_000, timeoutMsg: `Prompt row state mismatch: ${name}` }
		);
	}

	private async promptRowExists(name: string): Promise<boolean> {
		return browser.execute((testId, promptName) => {
			return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row instanceof HTMLElement && row.getAttribute('data-prompt-name') === promptName);
		}, TestIds.settings.promptRow, name);
	}

	private async clickPromptAction(actionTestId: string, promptName: string): Promise<void> {
		await this.waitForPromptRow(promptName);
		await browser.execute((rowTestId, buttonTestId, name) => {
			const row = Array.from(document.querySelectorAll(`[data-testid="${rowTestId}"]`))
				.find(candidate => candidate instanceof HTMLElement && candidate.getAttribute('data-prompt-name') === name);
			if (!(row instanceof HTMLElement)) {
				throw new Error(`Prompt row not found: ${name}`);
			}
			const button = row.querySelector(`[data-testid="${buttonTestId}"]`);
			if (!(button instanceof HTMLElement)) {
				throw new Error(`Prompt action not found: ${buttonTestId}`);
			}
			button.click();
		}, TestIds.settings.promptRow, actionTestId, promptName);
	}

	private async clickSettingsTab(tabId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((testId, id) => {
				return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
					.some(tab => tab instanceof HTMLElement && tab.getAttribute('data-tab-id') === id);
			}, TestIds.settings.tab, tabId),
			{ timeout: 10_000, timeoutMsg: `Settings tab not found: ${tabId}` }
		);
		await browser.execute((testId, id) => {
			const tab = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate instanceof HTMLElement && candidate.getAttribute('data-tab-id') === id);
			if (!(tab instanceof HTMLElement)) {
				throw new Error(`Settings tab not found: ${id}`);
			}
			tab.click();
		}, TestIds.settings.tab, tabId);
	}
}
