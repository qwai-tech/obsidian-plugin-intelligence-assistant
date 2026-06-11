import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

type QuickActionModalValues = {
	name?: string;
	actionType?: 'replace' | 'explain';
	prompt?: string;
};

export class QuickActionsSettingsPage extends BasePage {
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
		await this.clickSettingsTab('quickactions');
		await this.waitFor(TestIds.settings.quickActionAddBtn);
	}

	async setPrefix(prefix: string): Promise<void> {
		await this.open();
		await this.type(TestIds.settings.quickActionPrefixInput, prefix);
	}

	async addAction(): Promise<void> {
		await this.open();
		await this.click(TestIds.settings.quickActionAddBtn);
		await this.waitForActionRow('New Quick Action');
	}

	async editAction(currentName: string, values: QuickActionModalValues): Promise<void> {
		await this.clickActionButton(TestIds.settings.quickActionEditBtn, currentName);
		await this.waitFor(TestIds.settings.quickActionModalNameInput);
		if (values.name !== undefined) {
			await this.type(TestIds.settings.quickActionModalNameInput, values.name);
		}
		if (values.actionType !== undefined) {
			await this.setSelectValue(TestIds.settings.quickActionModalTypeSelect, values.actionType);
		}
		if (values.prompt !== undefined) {
			await this.type(TestIds.settings.quickActionModalPromptInput, values.prompt);
		}
		await this.click(TestIds.settings.quickActionModalSaveBtn);
		await this.waitForActionRow(values.name ?? currentName);
	}

	async setActionEnabled(name: string, enabled: boolean): Promise<void> {
		await this.waitForActionRow(name);
		await browser.execute((rowTestId, toggleTestId, actionName, target) => {
			const row = Array.from(document.querySelectorAll(`[data-testid="${rowTestId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-action-name') === actionName);
			if (!(row instanceof HTMLElement)) {
				throw new Error(`Quick action row not found: ${actionName}`);
			}
			const toggle = row.querySelector(`[data-testid="${toggleTestId}"]`);
			if (!(toggle instanceof HTMLInputElement)) {
				throw new Error(`Quick action toggle not found: ${actionName}`);
			}
			if (toggle.checked !== target) {
				toggle.click();
			}
		}, TestIds.settings.quickActionRow, TestIds.settings.quickActionToggle, name, enabled);
		await this.waitForActionEnabled(name, enabled);
	}

	async deleteAction(name: string): Promise<void> {
		await this.clickActionButton(TestIds.settings.quickActionDeleteBtn, name);
		await this.click(TestIds.settings.confirmModalConfirmBtn);
		await this.waitForActionRow(name, false);
	}

	async waitForActionRow(name: string, expected = true): Promise<void> {
		await browser.waitUntil(
			async () => this.actionRowExists(name).then(exists => exists === expected),
			{ timeout: 10_000, timeoutMsg: `Quick action row state mismatch: ${name}` }
		);
	}

	private async waitForActionEnabled(name: string, enabled: boolean): Promise<void> {
		await browser.waitUntil(
			async () => this.getActionEnabled(name).then(value => value === enabled),
			{ timeout: 10_000, timeoutMsg: `Quick action enabled state mismatch: ${name}` }
		);
	}

	private async actionRowExists(name: string): Promise<boolean> {
		return browser.execute((testId, actionName) => {
			return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row.instanceOf(HTMLElement) && row.getAttribute('data-action-name') === actionName);
		}, TestIds.settings.quickActionRow, name);
	}

	private async getActionEnabled(name: string): Promise<boolean> {
		return browser.execute((rowTestId, toggleTestId, actionName) => {
			const row = Array.from(document.querySelectorAll(`[data-testid="${rowTestId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-action-name') === actionName);
			const toggle = row instanceof HTMLElement
				? row.querySelector(`[data-testid="${toggleTestId}"]`)
				: null;
			return toggle instanceof HTMLInputElement ? toggle.checked : false;
		}, TestIds.settings.quickActionRow, TestIds.settings.quickActionToggle, name);
	}

	private async clickActionButton(buttonTestId: string, actionName: string): Promise<void> {
		await this.waitForActionRow(actionName);
		await browser.execute((rowTestId, testId, name) => {
			const row = Array.from(document.querySelectorAll(`[data-testid="${rowTestId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-action-name') === name);
			if (!(row instanceof HTMLElement)) {
				throw new Error(`Quick action row not found: ${name}`);
			}
			const button = row.querySelector(`[data-testid="${testId}"]`);
			if (!(button instanceof HTMLElement)) {
				throw new Error(`Quick action button not found: ${testId}`);
			}
			button.click();
		}, TestIds.settings.quickActionRow, buttonTestId, actionName);
	}

	private async clickSettingsTab(tabId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((testId, id) => {
				return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
					.some(tab => tab.instanceOf(HTMLElement) && tab.getAttribute('data-tab-id') === id);
			}, TestIds.settings.tab, tabId),
			{ timeout: 10_000, timeoutMsg: `Settings tab not found: ${tabId}` }
		);
		await browser.execute((testId, id) => {
			const tab = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-tab-id') === id);
			if (!(tab instanceof HTMLElement)) {
				throw new Error(`Settings tab not found: ${id}`);
			}
			tab.click();
		}, TestIds.settings.tab, tabId);
	}

	private async setSelectValue(testId: string, value: string): Promise<void> {
		await this.waitFor(testId);
		await browser.execute((id, selected) => {
			const select = document.querySelector(`[data-testid="${id}"]`);
			if (!(select instanceof HTMLSelectElement)) {
				throw new Error(`Select not found: ${id}`);
			}
			select.value = selected;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}, testId, value);
	}
}
