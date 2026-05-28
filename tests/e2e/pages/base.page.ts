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

	protected async click(id: string): Promise<void> {
		await this.waitFor(id);
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
