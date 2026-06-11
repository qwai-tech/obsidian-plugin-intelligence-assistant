import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

export class GeneralSettingsPage extends BasePage {
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
		await this.clickSettingsTab('general');
		await this.waitFor(TestIds.settings.generalDefaultModelInput);
	}

	async setDefaultModel(modelId: string): Promise<void> {
		await this.setTextInputValue(TestIds.settings.generalDefaultModelInput, modelId);
		await this.waitForPluginSetting('defaultModel', modelId);
	}

	async getDefaultModel(): Promise<string> {
		await this.waitFor(TestIds.settings.generalDefaultModelInput);
		return this.$testid(TestIds.settings.generalDefaultModelInput).getValue();
	}

	async setConversationTitleMode(mode: string): Promise<void> {
		await this.setSelectValue(TestIds.settings.generalConversationTitleModeSelect, mode);
		await this.waitForPluginSetting('conversationTitleMode', mode);
	}

	async getConversationTitleMode(): Promise<string> {
		await this.waitFor(TestIds.settings.generalConversationTitleModeSelect);
		return browser.execute((testId) => {
			const select = document.querySelector(`[data-testid="${testId}"]`);
			if (!(select instanceof HTMLSelectElement)) {
				throw new Error(`Select not found: ${testId}`);
			}
			return select.value;
		}, TestIds.settings.generalConversationTitleModeSelect);
	}

	async setConversationIconsEnabled(enabled: boolean): Promise<void> {
		const current = await this.getPluginSetting<boolean>('conversationIconEnabled');
		if (current !== enabled) {
			await this.click(TestIds.settings.generalConversationIconToggle);
		}
		await this.waitForPluginSetting('conversationIconEnabled', enabled);
	}

	async getConversationIconsEnabled(): Promise<boolean> {
		return this.getPluginSetting<boolean>('conversationIconEnabled');
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

	private async setTextInputValue(testId: string, value: string): Promise<void> {
		await this.waitFor(testId);
		await browser.execute((id, selected) => {
			const input = document.querySelector(`[data-testid="${id}"]`);
			if (!(input instanceof HTMLInputElement)) {
				throw new Error(`Text input not found: ${id}`);
			}
			input.value = selected;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}, testId, value);
	}

	private async waitForPluginSetting<T>(key: string, value: T): Promise<void> {
		await browser.waitUntil(
			async () => (await this.getPluginSetting<T>(key)) === value,
			{ timeout: 10_000, timeoutMsg: `Plugin setting did not update: ${key}` }
		);
	}

	private async getPluginSetting<T>(key: string): Promise<T> {
		const value = await browser.execute((settingKey) => {
			const app = (window as unknown as {
				app: { plugins: { plugins: Record<string, { settings?: Record<string, unknown> }> } };
			}).app;
			return app.plugins.plugins['intelligence-assistant']?.settings?.[settingKey];
		}, key);
		return value as T;
	}
}
