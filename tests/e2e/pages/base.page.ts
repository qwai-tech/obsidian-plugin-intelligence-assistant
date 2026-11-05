/**
 * Shared selector primitives for all Page Objects.
 * Selectors target `data-testid` attributes only.
 */
export abstract class BasePage {
	protected $testid(id: string): ChainablePromiseElement {
		return $(`[data-testid="${id}"]`);
	}

	protected $$testid(id: string): ChainablePromiseArray {
		return $$(`[data-testid="${id}"]`);
	}

	protected async waitForAnimations(): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute(() => activeDocument.getAnimations().every(animation => animation.playState !== 'running')),
			{ timeout: 5_000, timeoutMsg: 'Animations did not settle' }
		);
	}

	protected async waitFor(id: string, timeoutMs = 10_000): Promise<void> {
		await this.$testid(id).waitForDisplayed({ timeout: timeoutMs });
	}

	async expectVisible(id: string, timeoutMs = 10_000): Promise<void> {
		await this.$testid(id).waitForDisplayed({
			timeout: timeoutMs,
			timeoutMsg: `Expected [data-testid="${id}"] to be visible`,
		});
	}

	async expectAbsent(id: string, timeoutMs = 10_000): Promise<void> {
		await this.$testid(id).waitForExist({
			timeout: timeoutMs,
			reverse: true,
			timeoutMsg: `Expected [data-testid="${id}"] to be absent`,
		});
	}

	protected async openPluginSettings(): Promise<void> {
		await browser.execute(() => {
			const app = (window as unknown as {
				app: { setting: { open(): void; openTabById(id: string): void } };
			}).app;
			app.setting.open();
			app.setting.openTabById('intelligence-assistant');
		});
		await $('.vertical-tab-content .setting-item').waitForDisplayed({ timeout: 10_000 });
	}

	protected async openSettingsSection(name: string): Promise<void> {
		await this.openPluginSettings();
		await browser.waitUntil(
			async () => browser.execute((label) => {
				const tab = Array.from(activeDocument.querySelectorAll('.ia-settings-main-tabs [role="tab"]'))
					.find(item => item.textContent === label);
				if (!(tab instanceof HTMLElement)) return false;
				tab.click();
				return true;
			}, name),
			{ timeout: 10_000, timeoutMsg: `Settings section not found: ${name}` }
		);
		await $('#ia-settings-section-panel').waitForDisplayed({ timeout: 10_000 });
		await this.waitForAnimations();
	}

	protected settingControl(name: string, control: 'input' | 'select' | '.checkbox-container'): ChainablePromiseElement {
		return $(`//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space()="${name}"]]`).$(control);
	}

	protected async click(id: string): Promise<void> {
		await this.$testid(id).waitForClickable({ timeout: 10_000 });
		await this.$testid(id).click();
	}

	protected async type(id: string, value: string): Promise<void> {
		await this.waitFor(id);
		await this.$testid(id).setValue(value);
	}

	protected async getText(id: string): Promise<string> {
		await this.waitFor(id);
		return this.$testid(id).getText();
	}

	protected async isVisible(id: string): Promise<boolean> {
		return this.$testid(id).isDisplayed().catch(() => false);
	}
}
