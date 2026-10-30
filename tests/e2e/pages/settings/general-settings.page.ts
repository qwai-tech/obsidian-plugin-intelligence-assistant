import { BasePage } from '../base.page';

const DEFAULT_MODEL = 'Default model';
const TITLE_MODE = 'Conversation title mode';
const CONVERSATION_ICONS = 'Conversation icons';

export class GeneralSettingsPage extends BasePage {
	async open(): Promise<void> {
		await this.openPluginSettings();
		await this.settingControl(DEFAULT_MODEL, 'input').waitForDisplayed({ timeout: 10_000 });
	}

	async setDefaultModel(modelId: string): Promise<void> {
		await this.setNamedControl(DEFAULT_MODEL, 'input', modelId);
		await this.waitForPluginSetting('defaultModel', modelId);
	}

	async getDefaultModel(): Promise<string> {
		return this.settingControl(DEFAULT_MODEL, 'input').getValue();
	}

	async setConversationTitleMode(mode: string): Promise<void> {
		await this.setNamedControl(TITLE_MODE, 'select', mode);
		await this.waitForPluginSetting('conversationTitleMode', mode);
	}

	async getConversationTitleMode(): Promise<string> {
		return this.settingControl(TITLE_MODE, 'select').getValue();
	}

	async setConversationIconsEnabled(enabled: boolean): Promise<void> {
		if ((await this.getPluginSetting<boolean>('conversationIconEnabled')) !== enabled) {
			await this.settingControl(CONVERSATION_ICONS, '.checkbox-container').click();
		}
		await this.waitForPluginSetting('conversationIconEnabled', enabled);
	}

	async getConversationIconsEnabled(): Promise<boolean> {
		return this.getPluginSetting<boolean>('conversationIconEnabled');
	}

	private async setNamedControl(name: string, control: 'input' | 'select', value: string): Promise<void> {
		const element = await this.settingControl(name, control).getElement();
		await element.waitForDisplayed({ timeout: 10_000 });
		await browser.execute((el, next) => {
			el.value = next;
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		}, element as unknown as HTMLInputElement, value);
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
