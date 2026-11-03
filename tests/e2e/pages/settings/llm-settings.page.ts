import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

interface ProviderFormValues {
	provider?: string;
	apiKey?: { secret: string; value: string };
	baseUrl?: string;
	modelFilter?: string;
}

export class LlmSettingsPage extends BasePage {
	async openProviderTab(): Promise<void> {
		await this.openSettingsSection('LLM');
		await this.waitFor(TestIds.settings.providerAddBtn);
	}

	async addProvider(values: Required<Pick<ProviderFormValues, 'provider'>> & ProviderFormValues): Promise<void> {
		await this.click(TestIds.settings.providerAddBtn);
		await this.fillProviderModal(values);
		await this.click(TestIds.settings.providerModalSaveBtn);
		await this.waitForProviderRow(values.provider);
	}

	async openNewProviderForm(values: ProviderFormValues): Promise<void> {
		await this.click(TestIds.settings.providerAddBtn);
		await this.fillProviderModal(values);
	}

	async testConnectionInForm(): Promise<void> {
		await this.click(TestIds.settings.providerModalTestConnectionBtn);
	}

	async editProvider(providerId: string, values: ProviderFormValues): Promise<void> {
		await this.clickProviderAction(TestIds.settings.providerEditBtn, providerId);
		await this.fillProviderModal(values);
		await this.click(TestIds.settings.providerModalSaveBtn);
		await this.waitForProviderRow(providerId);
	}

	async refreshProviderModels(providerId: string): Promise<void> {
		await this.clickProviderAction(TestIds.settings.providerRefreshBtn, providerId);
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

	private async fillProviderModal(values: ProviderFormValues): Promise<void> {
		if (values.provider !== undefined) {
			await this.setSelectValue(TestIds.settings.providerModalProviderSelect, values.provider);
		}
		if (values.modelFilter !== undefined) {
			await this.type(TestIds.settings.providerModalModelFilterInput, values.modelFilter);
		}
		if (values.apiKey !== undefined) {
			await this.linkSecret(TestIds.settings.providerModalApiKeyInput, values.apiKey.secret, values.apiKey.value);
		}
		if (values.baseUrl !== undefined) {
			await this.type(TestIds.settings.providerModalBaseUrlInput, values.baseUrl);
		}
	}

	async cancelProviderForm(): Promise<void> {
		await this.click(TestIds.settings.providerModalCancelBtn);
	}

	async saveProviderForm(provider: string): Promise<void> {
		await this.click(TestIds.settings.providerModalSaveBtn);
		await this.waitForProviderRow(provider);
	}

	async cachedModelIds(provider: string): Promise<string[]> {
		return browser.execute((providerId) => {
			const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, { settings: { llmConfigs: Array<{ provider: string; cachedModels?: Array<{ id: string }> }> } }> } } }).app.plugins.plugins['intelligence-assistant'];
			return plugin.settings.llmConfigs.filter(config => config.provider === providerId).flatMap(config => (config.cachedModels ?? []).map(model => model.id));
		}, provider);
	}

	async readSecret(secret: string): Promise<string | null> {
		return browser.execute((id) => (window as unknown as {
			app: { secretStorage: { getSecret(id: string): string | null } };
		}).app.secretStorage.getSecret(id), secret);
	}

	private async linkSecret(testId: string, secret: string, value: string): Promise<void> {
		await browser.execute((id, text) => (window as unknown as {
			app: { secretStorage: { setSecret(id: string, secret: string): void } };
		}).app.secretStorage.setSecret(id, text), secret, value);
		await this.waitFor(testId);
		await this.$testid(testId).$('button').click();
		const picker = $('.modal.mod-secret');
		await picker.waitForDisplayed({ timeout: 10_000, timeoutMsg: 'Secret picker did not open' });
		await picker.$(`.suggestion-title=${secret}`).click();
		await picker.$('button.mod-cta').click();
		await picker.waitForDisplayed({ reverse: true, timeout: 10_000, timeoutMsg: 'Secret picker did not close' });
	}

	private async clickProviderAction(testId: string, providerId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((selectorTestId, id) => {
				return Array.from(activeDocument.querySelectorAll(`[data-testid="${selectorTestId}"]`))
					.some(button => button.instanceOf(HTMLElement) && button.getAttribute('data-provider-id') === id);
			}, testId, providerId),
			{ timeout: 10_000, timeoutMsg: `Provider action not found: ${providerId}` }
		);
		await browser.execute((selectorTestId, id) => {
			const button = Array.from(activeDocument.querySelectorAll(`[data-testid="${selectorTestId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-provider-id') === id);
			if (!(button instanceof HTMLElement)) {
				throw new Error(`Provider action not found: ${id}`);
			}
			button.click();
		}, testId, providerId);
	}

	private async providerRowExists(providerId: string): Promise<boolean> {
		return browser.execute((testId, id) => {
			return Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row.instanceOf(HTMLElement) && row.getAttribute('data-provider-id') === id);
		}, TestIds.settings.providerRow, providerId);
	}

	private async setSelectValue(testId: string, value: string): Promise<void> {
		await this.waitFor(testId);
		await browser.execute((id, selected) => {
			const select = activeDocument.querySelector(`[data-testid="${id}"]`);
			if (!(select instanceof HTMLSelectElement)) {
				throw new Error(`Select not found: ${id}`);
			}
			select.value = selected;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}, testId, value);
	}
}
