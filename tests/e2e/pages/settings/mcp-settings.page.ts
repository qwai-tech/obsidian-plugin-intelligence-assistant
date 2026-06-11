import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

interface McpServerForm {
	name: string;
	command: string;
	args?: string;
}

export class McpSettingsPage extends BasePage {
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
		await this.clickSettingsTab('mcp');
		await this.waitFor(TestIds.settings.mcpAddBtn);
	}

	async addServer(values: McpServerForm): Promise<void> {
		await this.click(TestIds.settings.mcpAddBtn);
		await this.type(TestIds.settings.mcpModalNameInput, values.name);
		await this.type(TestIds.settings.mcpModalCommandInput, values.command);
		if (values.args !== undefined) {
			await this.type(TestIds.settings.mcpModalArgsInput, values.args);
		}
		await this.click(TestIds.settings.mcpModalSaveBtn);
		await this.waitForServerRow(values.name);
	}

	async connectServer(name: string): Promise<void> {
		await this.clickServerAction(TestIds.settings.mcpConnectBtn, name);
		await browser.waitUntil(
			async () => {
				const rowText = await this.getServerRowText(name);
				return rowText.includes('Connected') || rowText.includes('1');
			},
			{ timeout: 15_000, timeoutMsg: `MCP server did not connect: ${name}` }
		);
	}

	private async waitForServerRow(name: string, timeoutMs = 10_000): Promise<void> {
		await browser.waitUntil(
			async () => this.serverRowExists(name),
			{ timeout: timeoutMs, timeoutMsg: `MCP server row not found: ${name}` }
		);
	}

	private async serverRowExists(name: string): Promise<boolean> {
		return browser.execute((testId, serverName) => {
			return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row.instanceOf(HTMLElement) && row.getAttribute('data-mcp-name') === serverName);
		}, TestIds.settings.mcpRow, name);
	}

	private async getServerRowText(name: string): Promise<string> {
		await this.waitForServerRow(name);
		return browser.execute((testId, serverName) => {
			const row = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-mcp-name') === serverName);
			return row instanceof HTMLElement ? (row.innerText || row.textContent || '') : '';
		}, TestIds.settings.mcpRow, name);
	}

	private async clickServerAction(testId: string, name: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((selectorTestId, serverName) => {
				return Array.from(document.querySelectorAll(`[data-testid="${selectorTestId}"]`))
					.some(button => button.instanceOf(HTMLElement) && button.getAttribute('data-mcp-name') === serverName);
			}, testId, name),
			{ timeout: 10_000, timeoutMsg: `MCP action not found: ${name}` }
		);
		await browser.execute((selectorTestId, serverName) => {
			const button = Array.from(document.querySelectorAll(`[data-testid="${selectorTestId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-mcp-name') === serverName);
			if (!(button instanceof HTMLElement)) {
				throw new Error(`MCP action not found: ${serverName}`);
			}
			button.click();
		}, testId, name);
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
}
