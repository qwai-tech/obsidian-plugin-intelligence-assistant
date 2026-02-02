/**
 * Helper functions for Tools settings E2E tests
 */

import { SELECTORS } from './selectors';
import { navigateToTab } from './actions';

/**
 * Open API source configuration
 */
export interface OpenApiSourceConfig {
	name: string;
	enabled?: boolean;
	sourceType?: 'file' | 'url';
	specPath?: string;
	specUrl?: string;
	baseUrl?: string;
	authType?: 'none' | 'header' | 'query';
	authKey?: string;
	authValue?: string;
}

// === Navigation ===

/**
 * Open the Tools tab in settings
 */
export async function openToolsTab() {
	await navigateToTab(SELECTORS.tools.tab);
	const tabContent = await $(SELECTORS.tools.tabContent);
	await tabContent.waitForDisplayed({ timeout: 5000 });
}

/**
 * Switch to a specific tools subtab
 */
export async function switchToolsSubtab(subtab: 'built-in' | 'mcp' | 'openapi') {
	const subtabSelector = {
		'built-in': SELECTORS.tools.builtInSubtab,
		'mcp': SELECTORS.tools.mcpSubtab,
		'openapi': SELECTORS.tools.openapiSubtab,
	}[subtab];

	const subtabButton = await $(subtabSelector);
	await subtabButton.click();
	await browser.pause(500);
}

// === Built-in Tools ===

/**
 * Get list of all built-in tool names
 */
export async function getBuiltInTools(): Promise<string[]> {
	const rows = await $$(SELECTORS.tools.builtInTableRows);
	const toolNames: string[] = [];

	for (const row of rows) {
		const nameCell = await row.$(SELECTORS.tools.toolName);
		const text = await nameCell.getText();
		// Extract just the tool name, removing icon
		const name = text.replace(/^\S+\s*/, '').trim();
		toolNames.push(name);
	}

	return toolNames;
}

/**
 * Check if a built-in tool is enabled
 */
export async function isBuiltInToolEnabled(toolName: string): Promise<boolean> {
	const toolRow = await $(SELECTORS.tools.builtInToolRow(toolName));
	const checkbox = await toolRow.$(SELECTORS.tools.toolCheckbox);
	return await checkbox.isSelected();
}

/**
 * Toggle a built-in tool on/off
 */
export async function toggleBuiltInTool(toolName: string, enabled: boolean) {
	const isCurrentlyEnabled = await isBuiltInToolEnabled(toolName);

	if (isCurrentlyEnabled !== enabled) {
		const toolRow = await $(SELECTORS.tools.builtInToolRow(toolName));
		const checkbox = await toolRow.$(SELECTORS.tools.toolCheckbox);
		await checkbox.click();
		await browser.pause(500);
	}
}

/**
 * Get tool metadata (category, description)
 */
export async function getBuiltInToolMetadata(toolName: string): Promise<{ category: string; description: string }> {
	const toolRow = await $(SELECTORS.tools.builtInToolRow(toolName));

	const categoryCell = await toolRow.$(SELECTORS.tools.toolCategory);
	const category = await categoryCell.getText();

	const descCell = await toolRow.$(SELECTORS.tools.toolDescription);
	const description = await descCell.getText();

	return { category, description };
}

/**
 * Check if info callout is displayed
 */
export async function hasBuiltInInfoCallout(): Promise<boolean> {
	const callout = await $(SELECTORS.tools.infoCallout);
	return (await callout.isExisting()) && (await callout.isDisplayed());
}

// === MCP Tools (Read-only) ===

/**
 * Get MCP tools for a specific server
 */
export async function getMcpToolsForServer(serverName: string): Promise<string[]> {
	const rows = await $$(SELECTORS.tools.mcpToolsTableRows);
	const tools: string[] = [];

	for (const row of rows) {
		const serverCell = await row.$(SELECTORS.tools.mcpServerCell);
		const serverText = await serverCell.getText();

		if (serverText.includes(serverName)) {
			const toolNameCell = await row.$(SELECTORS.tools.mcpToolNameCell);
			const toolName = await toolNameCell.getText();
			if (toolName) {
				tools.push(toolName);
			}
		}
	}

	return tools;
}

/**
 * Get tool source (live or cached) for an MCP tool
 */
export async function getMcpToolSource(toolName: string): Promise<'live' | 'cached' | null> {
	const rows = await $$(SELECTORS.tools.mcpToolsTableRows);

	for (const row of rows) {
		const toolNameCell = await row.$(SELECTORS.tools.mcpToolNameCell);
		const name = await toolNameCell.getText();

		if (name === toolName) {
			const sourceCell = await row.$(SELECTORS.tools.mcpToolSourceCell);
			const sourceText = await sourceCell.getText();
			return sourceText.toLowerCase().includes('live') ? 'live' : 'cached';
		}
	}

	return null;
}

/**
 * Check if MCP tools tab shows empty state
 */
export async function hasMcpToolsEmptyState(): Promise<boolean> {
	const emptyState = await $(SELECTORS.tools.mcpEmptyState);
	return (await emptyState.isExisting()) && (await emptyState.isDisplayed());
}

// === OpenAPI Tools ===

/**
 * Add a new OpenAPI source
 */
export async function addOpenApiSource(config: OpenApiSourceConfig) {
	const addButton = await $(SELECTORS.tools.openApiAddButton);
	await addButton.click();
	await browser.pause(500);

	await fillOpenApiForm(config);

	// Close modal - changes should auto-save
	const modal = await $(SELECTORS.tools.openApiModal.container);
	await browser.keys('Escape');
	await modal.waitForDisplayed({ timeout: 3000, reverse: true });
	await browser.pause(500);
}

/**
 * Edit an existing OpenAPI source
 */
export async function editOpenApiSource(sourceName: string, updates: Partial<OpenApiSourceConfig>) {
	const editButton = await $(SELECTORS.tools.openApiEditButton(sourceName));
	await editButton.click();
	await browser.pause(500);

	await fillOpenApiForm(updates);

	// Close modal
	const modal = await $(SELECTORS.tools.openApiModal.container);
	await browser.keys('Escape');
	await modal.waitForDisplayed({ timeout: 3000, reverse: true });
	await browser.pause(500);
}

/**
 * Fill the OpenAPI configuration form
 */
async function fillOpenApiForm(config: Partial<OpenApiSourceConfig>) {
	const modal = await $(SELECTORS.tools.openApiModal.container);
	await modal.waitForDisplayed({ timeout: 5000 });

	if (config.name !== undefined) {
		const nameInput = await $(SELECTORS.tools.openApiModal.nameInput);
		await nameInput.setValue(config.name);
		await nameInput.click(); // Blur to trigger auto-save
		await browser.pause(300);
	}

	if (config.enabled !== undefined) {
		const toggle = await $(SELECTORS.tools.openApiModal.enabledToggle);
		await toggle.click();
		await browser.pause(500); // Enabled toggle triggers reload
	}

	if (config.sourceType !== undefined) {
		const dropdown = await $(SELECTORS.tools.openApiModal.sourceTypeDropdown);
		await dropdown.selectByVisibleText(
			config.sourceType === 'file' ? 'Local file' : 'Remote URL'
		);
		await browser.pause(500); // Source type change reopens modal
	}

	if (config.specPath !== undefined) {
		const pathInput = await $(SELECTORS.tools.openApiModal.filePathInput);
		if (await pathInput.isExisting()) {
			await pathInput.setValue(config.specPath);
			await pathInput.click(); // Blur to auto-save
			await browser.pause(300);
		}
	}

	if (config.specUrl !== undefined) {
		const urlInput = await $(SELECTORS.tools.openApiModal.urlInput);
		if (await urlInput.isExisting()) {
			await urlInput.setValue(config.specUrl);
			await urlInput.click(); // Blur to auto-save
			await browser.pause(300);
		}
	}

	if (config.baseUrl !== undefined) {
		const baseUrlInput = await $(SELECTORS.tools.openApiModal.baseUrlInput);
		await baseUrlInput.setValue(config.baseUrl);
		await baseUrlInput.click(); // Blur to auto-save
		await browser.pause(300);
	}

	if (config.authType !== undefined) {
		const authDropdown = await $(SELECTORS.tools.openApiModal.authDropdown);
		const authText = {
			'none': 'None',
			'header': 'HTTP header',
			'query': 'Query parameter',
		}[config.authType];
		await authDropdown.selectByVisibleText(authText);
		await browser.pause(300);
	}

	if (config.authKey !== undefined) {
		const keyInput = await $(SELECTORS.tools.openApiModal.credKeyInput);
		await keyInput.setValue(config.authKey);
		await keyInput.click(); // Blur to auto-save
		await browser.pause(300);
	}

	if (config.authValue !== undefined) {
		const valueInput = await $(SELECTORS.tools.openApiModal.credValueInput);
		await valueInput.setValue(config.authValue);
		await valueInput.click(); // Blur to auto-save
		await browser.pause(300);
	}
}

/**
 * Delete an OpenAPI source
 */
export async function deleteOpenApiSource(sourceName: string) {
	const deleteButton = await $(SELECTORS.tools.openApiDeleteButton(sourceName));
	await deleteButton.click();
	await browser.pause(500);
}

/**
 * Get list of all OpenAPI source names
 */
export async function getOpenApiSources(): Promise<string[]> {
	const rows = await $$(SELECTORS.tools.openApiTableRows);
	const sources: string[] = [];

	for (const row of rows) {
		const cells = await row.$$('td');
		if (cells.length > 0) {
			const nameText = await cells[0].getText();
			sources.push(nameText);
		}
	}

	return sources;
}

/**
 * Check if an OpenAPI source exists
 */
export async function isOpenApiSourceExists(sourceName: string): Promise<boolean> {
	const sourceRow = await $(SELECTORS.tools.openApiSourceRow(sourceName));
	return await sourceRow.isExisting();
}

/**
 * Reload tools for an OpenAPI source
 */
export async function reloadOpenApiSource(sourceName: string) {
	const reloadButton = await $(SELECTORS.tools.openApiReloadButton(sourceName));
	await reloadButton.click();
	await browser.pause(2000); // Wait for reload to complete
}

/**
 * Refetch tools from URL (URL sources only)
 */
export async function refetchOpenApiSource(sourceName: string) {
	const refetchButton = await $(SELECTORS.tools.openApiRefetchButton(sourceName));
	if (await refetchButton.isExisting()) {
		await refetchButton.click();
		await browser.pause(2000); // Wait for refetch to complete
	}
}

/**
 * Check if refetch button is available (URL sources only)
 */
export async function isRefetchAvailable(sourceName: string): Promise<boolean> {
	const refetchButton = await $(SELECTORS.tools.openApiRefetchButton(sourceName));
	return await refetchButton.isExisting();
}

/**
 * Open OpenAPI modal for editing
 */
export async function openOpenApiModal(sourceName?: string) {
	if (sourceName) {
		const editButton = await $(SELECTORS.tools.openApiEditButton(sourceName));
		await editButton.click();
	} else {
		const addButton = await $(SELECTORS.tools.openApiAddButton);
		await addButton.click();
	}

	const modal = await $(SELECTORS.tools.openApiModal.container);
	await modal.waitForDisplayed({ timeout: 5000 });
	await browser.pause(500);
}

/**
 * Close OpenAPI modal
 */
export async function closeOpenApiModal() {
	const modal = await $(SELECTORS.tools.openApiModal.container);
	if (await modal.isDisplayed()) {
		await browser.keys('Escape');
		await modal.waitForDisplayed({ timeout: 3000, reverse: true });
	}
}

/**
 * Check if OpenAPI tab shows empty state
 */
export async function hasOpenApiEmptyState(): Promise<boolean> {
	const emptyState = await $(SELECTORS.tools.openApiEmptyState);
	return (await emptyState.isExisting()) && (await emptyState.isDisplayed());
}

/**
 * Get the source type of an OpenAPI source from the table
 */
export async function getOpenApiSourceType(sourceName: string): Promise<'file' | 'url' | null> {
	const sourceRow = await $(SELECTORS.tools.openApiSourceRow(sourceName));
	if (!await sourceRow.isExisting()) {
		return null;
	}

	const cells = await sourceRow.$$('td');
	if (cells.length > 1) {
		const sourceText = await cells[1].getText(); // Source column
		return sourceText.includes('http') ? 'url' : 'file';
	}

	return null;
}

/**
 * Get the auth type of an OpenAPI source from the table
 */
export async function getOpenApiAuthType(sourceName: string): Promise<string | null> {
	const sourceRow = await $(SELECTORS.tools.openApiSourceRow(sourceName));
	if (!await sourceRow.isExisting()) {
		return null;
	}

	const cells = await sourceRow.$$('td');
	if (cells.length > 2) {
		const authText = await cells[2].getText(); // Auth column
		return authText;
	}

	return null;
}

/**
 * Get enabled status of an OpenAPI source
 */
export async function isOpenApiSourceEnabled(sourceName: string): Promise<boolean> {
	const sourceRow = await $(SELECTORS.tools.openApiSourceRow(sourceName));
	if (!await sourceRow.isExisting()) {
		return false;
	}

	const cells = await sourceRow.$$('td');
	if (cells.length > 3) {
		const statusText = await cells[3].getText(); // Status column
		return statusText.toLowerCase().includes('enabled');
	}

	return false;
}

/**
 * Wait for tools to load
 */
export async function waitForToolsLoad(timeout: number = 5000) {
	await browser.pause(timeout);
}

/**
 * Get tool count for a subtab
 */
export async function getToolCount(subtab: 'built-in' | 'mcp' | 'openapi'): Promise<number> {
	const rowSelector = {
		'built-in': SELECTORS.tools.builtInTableRows,
		'mcp': SELECTORS.tools.mcpToolsTableRows,
		'openapi': SELECTORS.tools.openApiTableRows,
	}[subtab];

	const rows = await $$(rowSelector);
	return rows.length;
}
