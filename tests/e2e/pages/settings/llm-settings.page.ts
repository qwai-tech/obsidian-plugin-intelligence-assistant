import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

interface ProviderFormValues {
	provider?: string;
	apiKey?: string;
	baseUrl?: string;
	modelFilter?: string;
}

export class LlmSettingsPage extends BasePage {
	async openProviderTab(): Promise<void> {
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
		await this.clickSettingsTab('llm');
		await this.waitFor(TestIds.settings.providerAddBtn);
	}

	async addProvider(values: Required<Pick<ProviderFormValues, 'provider'>> & ProviderFormValues): Promise<void> {
		await this.click(TestIds.settings.providerAddBtn);
		await this.fillProviderModal(values);
		await this.click(TestIds.settings.providerModalSaveBtn);
		await this.waitForProviderRow(values.provider);
	}

	async editProvider(providerId: string, values: ProviderFormValues): Promise<void> {
		await this.clickProviderAction(TestIds.settings.providerEditBtn, providerId);
		await this.fillProviderModal(values);
		await this.click(TestIds.settings.providerModalSaveBtn);
		await this.waitForProviderRow(providerId);
	}

	async deleteProvider(providerId: string): Promise<void> {
		await this.clickProviderAction(TestIds.settings.providerDeleteBtn, providerId);
		await this.click(TestIds.settings.confirmModalConfirmBtn);
		await this.waitForProviderAbsent(providerId);
	}

	async waitForProviderRow(providerId: string, timeoutMs = 10_000): Promise<void> {
		await browser.waitUntil(
			async () => this.providerRowExists(providerId),
			{ timeout: timeoutMs, timeoutMsg: `Provider row not found: ${providerId}` }
		);
	}

	async waitForProviderAbsent(providerId: string, timeoutMs = 10_000): Promise<void> {
		await browser.waitUntil(
			async () => !(await this.providerRowExists(providerId)),
			{ timeout: timeoutMs, timeoutMsg: `Provider row still exists: ${providerId}` }
		);
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

	private async fillProviderModal(values: ProviderFormValues): Promise<void> {
		if (values.provider !== undefined) {
			await this.setSelectValue(TestIds.settings.providerModalProviderSelect, values.provider);
		}
		if (values.modelFilter !== undefined) {
			await this.type(TestIds.settings.providerModalModelFilterInput, values.modelFilter);
		}
		if (values.apiKey !== undefined) {
			await this.type(TestIds.settings.providerModalApiKeyInput, values.apiKey);
		}
		if (values.baseUrl !== undefined) {
			await this.type(TestIds.settings.providerModalBaseUrlInput, values.baseUrl);
		}
	}

	private async clickProviderAction(testId: string, providerId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((selectorTestId, id) => {
				return Array.from(document.querySelectorAll(`[data-testid="${selectorTestId}"]`))
					.some(button => button instanceof HTMLElement && button.getAttribute('data-provider-id') === id);
			}, testId, providerId),
			{ timeout: 10_000, timeoutMsg: `Provider action not found: ${providerId}` }
		);
		await browser.execute((selectorTestId, id) => {
			const button = Array.from(document.querySelectorAll(`[data-testid="${selectorTestId}"]`))
				.find(candidate => candidate instanceof HTMLElement && candidate.getAttribute('data-provider-id') === id);
			if (!(button instanceof HTMLElement)) {
				throw new Error(`Provider action not found: ${id}`);
			}
			button.click();
		}, testId, providerId);
	}

	private async providerRowExists(providerId: string): Promise<boolean> {
		return browser.execute((testId, id) => {
			return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row instanceof HTMLElement && row.getAttribute('data-provider-id') === id);
		}, TestIds.settings.providerRow, providerId);
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
