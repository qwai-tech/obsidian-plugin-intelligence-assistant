import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

const PLUGIN_ID = 'intelligence-assistant';

type ToolsSubTab = 'built-in' | 'mcp' | 'openapi' | 'cli';
type ToolSourceKind = 'builtin' | 'mcp' | 'openapi' | 'cli';

interface OpenApiToolConfig {
	id: string;
	name: string;
	enabled: boolean;
	sourceType: 'file' | 'url';
	specPath?: string;
	specUrl?: string;
	baseUrl?: string;
	authType?: 'none' | 'header' | 'query';
	authKey?: string;
	authValue?: string;
}

interface CliToolConfig {
	id: string;
	name: string;
	description: string;
	command: string;
	args?: string[];
	enabled: boolean;
	timeout?: number;
	shell?: boolean;
	parameters?: unknown[];
}

export class ToolsSettingsPage extends BasePage {
	async open(subTab: ToolsSubTab = 'built-in'): Promise<void> {
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
		await this.clickSettingsTab('tools');
		await this.selectSubTab(subTab);
	}

	async selectSubTab(subTab: ToolsSubTab): Promise<void> {
		await browser.waitUntil(
			async () => this.subTabExists(subTab),
			{ timeout: 10_000, timeoutMsg: `Tools sub-tab not found: ${subTab}` }
		);
		await browser.execute((testId, id) => {
			const tab = Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-subtab-id') === id);
			if (!(tab instanceof HTMLElement)) {
				throw new Error(`Tools sub-tab not found: ${id}`);
			}
			tab.click();
		}, TestIds.settings.toolsSubTab, subTab);
	}

	async setBuiltinToolEnabled(toolType: string, enabled: boolean): Promise<void> {
		await this.open('built-in');
		await browser.waitUntil(
			async () => this.builtinToggleExists(toolType),
			{ timeout: 10_000, timeoutMsg: `Built-in tool toggle not found: ${toolType}` }
		);
		await browser.execute((testId, type, target) => {
			const toggle = Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLInputElement) && candidate.getAttribute('data-tool-type') === type);
			if (!(toggle instanceof HTMLInputElement)) {
				throw new Error(`Built-in tool toggle not found: ${type}`);
			}
			if (toggle.checked !== target) {
				toggle.click();
			}
		}, TestIds.settings.toolsBuiltinToggle, toolType, enabled);
		await browser.waitUntil(
			async () => this.getBuiltinToolEnabled(toolType).then(value => value === enabled),
			{ timeout: 10_000, timeoutMsg: `Built-in tool setting did not update: ${toolType}` }
		);
	}

	async getBuiltinToolEnabled(toolType: string): Promise<boolean> {
		return browser.execute((pluginId, type) => {
			const plugin = (window as unknown as {
				app: { plugins: { plugins: Record<string, { settings?: { builtInTools?: Array<{ type: string; enabled: boolean }> } }> } };
			}).app.plugins.plugins[pluginId];
			return plugin?.settings?.builtInTools?.find(tool => tool.type === type)?.enabled ?? false;
		}, PLUGIN_ID, toolType);
	}

	async createOpenApiTool(config: OpenApiToolConfig, specPath: string, spec: unknown): Promise<void> {
		await browser.execute(async (pluginId, toolConfig, path, contents) => {
			const app = (window as unknown as {
				app: {
					vault: {
						create(path: string, data: string): Promise<unknown>;
						createFolder(path: string): Promise<unknown>;
						getAbstractFileByPath(path: string): unknown;
						modify(file: unknown, data: string): Promise<void>;
						adapter: { exists(path: string): Promise<boolean>; remove(path: string): Promise<void> };
					};
					plugins: {
						plugins: Record<string, {
							settings: { openApiTools?: OpenApiToolConfig[] };
							saveSettings(): Promise<void>;
							reloadOpenApiConfig(id: string): Promise<number>;
						}>;
					};
				};
			}).app;
			const plugin = app.plugins.plugins[pluginId];
			const folder = path.split('/').slice(0, -1).join('/');
			if (folder) {
				const segments = folder.split('/').filter(Boolean);
				let current = '';
				for (const segment of segments) {
					current = current ? `${current}/${segment}` : segment;
					if (!(await app.vault.adapter.exists(current))) {
						await app.vault.createFolder(current);
					}
				}
			}
			const data = JSON.stringify(contents, null, 2);
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) {
				await app.vault.modify(existing, data);
			} else {
				if (await app.vault.adapter.exists(path)) {
					await app.vault.adapter.remove(path);
				}
				await app.vault.create(path, data);
			}
			plugin.settings.openApiTools = [
				...(plugin.settings.openApiTools ?? []).filter(item => item.id !== toolConfig.id),
				toolConfig,
			];
			await plugin.saveSettings();
			const loaded = await plugin.reloadOpenApiConfig(toolConfig.id);
			if (loaded < 1) {
				throw new Error(`OpenAPI tool did not load: ${toolConfig.id}`);
			}
		}, PLUGIN_ID, config, specPath, spec);
		await this.open('openapi');
		await this.waitForOpenApiRow(config.id);
	}

	async createCliTool(config: CliToolConfig): Promise<void> {
		await browser.execute(async (pluginId, toolConfig) => {
			const plugin = (window as unknown as {
				app: {
					plugins: {
						plugins: Record<string, {
							settings: { cliTools?: CliToolConfig[] };
							saveSettings(): Promise<void>;
							reloadCLITools(): Promise<void>;
						}>;
					};
				};
			}).app.plugins.plugins[pluginId];
			plugin.settings.cliTools = [
				...(plugin.settings.cliTools ?? []).filter(item => item.id !== toolConfig.id),
				toolConfig,
			];
			await plugin.saveSettings();
			await plugin.reloadCLITools();
		}, PLUGIN_ID, config);
		await this.open('cli');
		await this.waitForCliRow(config.id);
	}

	async closeSettings(): Promise<void> {
		await browser.execute(() => {
			const setting = (window as unknown as {
				app: { setting?: { close?: () => void } };
			}).app.setting;
			setting?.close?.();
		});
	}

	async waitForOpenApiRow(id: string): Promise<void> {
		await browser.waitUntil(
			async () => this.rowExists(TestIds.settings.toolsOpenApiRow, 'data-openapi-id', id),
			{ timeout: 10_000, timeoutMsg: `OpenAPI row not found: ${id}` }
		);
	}

	async waitForCliRow(id: string): Promise<void> {
		await browser.waitUntil(
			async () => this.rowExists(TestIds.settings.toolsCliRow, 'data-cli-id', id),
			{ timeout: 10_000, timeoutMsg: `CLI row not found: ${id}` }
		);
	}

	async getRegisteredToolNames(kind?: ToolSourceKind, sourceId?: string): Promise<string[]> {
		return browser.execute((pluginId, sourceKind, source) => {
			const plugin = (window as unknown as {
				app: {
					plugins: {
						plugins: Record<string, {
							getToolRegistry(): {
								getTools(): Array<{ llmName: string; origin: { kind: string; sourceId: string } }>;
							};
						}>;
					};
				};
			}).app.plugins.plugins[pluginId];
			return plugin.getToolRegistry().getTools()
				.filter(tool => sourceKind === undefined || tool.origin.kind === sourceKind)
				.filter(tool => source === undefined || tool.origin.sourceId === source)
				.map(tool => tool.llmName);
		}, PLUGIN_ID, kind, sourceId);
	}

	private async subTabExists(subTab: ToolsSubTab): Promise<boolean> {
		return browser.execute((testId, id) => {
			return Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.some(tab => tab.instanceOf(HTMLElement) && tab.getAttribute('data-subtab-id') === id);
		}, TestIds.settings.toolsSubTab, subTab);
	}

	private async builtinToggleExists(toolType: string): Promise<boolean> {
		return browser.execute((testId, type) => {
			return Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.some(toggle => toggle.instanceOf(HTMLInputElement) && toggle.getAttribute('data-tool-type') === type);
		}, TestIds.settings.toolsBuiltinToggle, toolType);
	}

	private async rowExists(testId: string, attr: string, value: string): Promise<boolean> {
		return browser.execute((rowTestId, rowAttr, rowValue) => {
			return Array.from(activeDocument.querySelectorAll(`[data-testid="${rowTestId}"]`))
				.some(row => row.instanceOf(HTMLElement) && row.getAttribute(rowAttr) === rowValue);
		}, testId, attr, value);
	}

	private async clickSettingsTab(tabId: string): Promise<void> {
		await browser.waitUntil(
			async () => browser.execute((testId, id) => {
				return Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
					.some(tab => tab.instanceOf(HTMLElement) && tab.getAttribute('data-tab-id') === id);
			}, TestIds.settings.tab, tabId),
			{ timeout: 10_000, timeoutMsg: `Settings tab not found: ${tabId}` }
		);
		await browser.execute((testId, id) => {
			const tab = Array.from(activeDocument.querySelectorAll(`[data-testid="${testId}"]`))
				.find(candidate => candidate.instanceOf(HTMLElement) && candidate.getAttribute('data-tab-id') === id);
			if (!(tab instanceof HTMLElement)) {
				throw new Error(`Settings tab not found: ${id}`);
			}
			tab.click();
		}, TestIds.settings.tab, tabId);
	}
}
