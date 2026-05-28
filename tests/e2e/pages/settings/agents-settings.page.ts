import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

export class AgentsSettingsPage extends BasePage {
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
		await this.clickSettingsTab('agents');
		await this.waitFor(TestIds.settings.agentAddBtn);
	}

	async createAgent(): Promise<string> {
		await this.click(TestIds.settings.agentAddBtn);
		await this.waitForAgentNamed('New Agent');
		return this.getAgentIdByName('New Agent');
	}

	async renameAgent(currentName: string, nextName: string): Promise<void> {
		const agentId = await this.getAgentIdByName(currentName);
		await this.clickAgentAction(TestIds.settings.agentEditBtn, agentId);
		await this.type(TestIds.settings.agentModalNameInput, nextName);
		await this.click(TestIds.settings.agentModalSaveBtn);
		await this.waitForAgentNamed(nextName);
	}

	async deleteAgent(name: string): Promise<void> {
		const agentId = await this.getAgentIdByName(name);
		await this.clickAgentAction(TestIds.settings.agentDeleteBtn, agentId);
		await this.click(TestIds.settings.confirmModalConfirmBtn);
		await this.waitForAgentAbsent(agentId);
	}

	async hasAgentNamed(name: string): Promise<boolean> {
		return browser.execute((testId, agentName) => {
			return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row instanceof HTMLElement && row.getAttribute('data-agent-name') === agentName);
		}, TestIds.settings.agentRow, name);
	}

	private async waitForAgentNamed(name: string, timeoutMs = 10_000): Promise<void> {
		await browser.waitUntil(
			async () => this.hasAgentNamed(name),
			{ timeout: timeoutMs, timeoutMsg: `Agent row not found: ${name}` }
		);
	}

	private async waitForAgentAbsent(agentId: string, timeoutMs = 10_000): Promise<void> {
		await browser.waitUntil(
			async () => !(await this.agentRowExists(agentId)),
			{ timeout: timeoutMs, timeoutMsg: `Agent row still exists: ${agentId}` }
		);
	}

	private async getAgentIdByName(name: string): Promise<string> {
		await this.waitForAgentNamed(name);
		const agentId = await browser.execute((testId, agentName) => {
			const row = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate instanceof HTMLElement && candidate.getAttribute('data-agent-name') === agentName);
			return row instanceof HTMLElement ? row.getAttribute('data-agent-id') ?? '' : '';
		}, TestIds.settings.agentRow, name);
		if (!agentId) {
			throw new Error(`Agent id not found for ${name}`);
		}
		return agentId;
	}

	private async agentRowExists(agentId: string): Promise<boolean> {
		return browser.execute((testId, id) => {
			return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`))
				.some(row => row instanceof HTMLElement && row.getAttribute('data-agent-id') === id);
		}, TestIds.settings.agentRow, agentId);
	}

	private async clickAgentAction(testId: string, agentId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((selectorTestId, id) => {
				return Array.from(document.querySelectorAll(`[data-testid="${selectorTestId}"]`))
					.some(button => button instanceof HTMLElement && button.getAttribute('data-agent-id') === id);
			}, testId, agentId),
			{ timeout: 10_000, timeoutMsg: `Agent action not found: ${agentId}` }
		);
		await browser.execute((selectorTestId, id) => {
			const button = Array.from(document.querySelectorAll(`[data-testid="${selectorTestId}"]`))
				.find(candidate => candidate instanceof HTMLElement && candidate.getAttribute('data-agent-id') === id);
			if (!(button instanceof HTMLElement)) {
				throw new Error(`Agent action not found: ${id}`);
			}
			button.click();
		}, testId, agentId);
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
