/**
 * Helper functions for MCP settings E2E tests
 */

import { SELECTORS } from './selectors';
import { navigateToTab, closeAllModals } from './actions';

export interface MCPServerConfig {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	enabled?: boolean;
	connectionMode?: 'auto' | 'manual';
}

// --- Navigation ---

/**
 * Open the MCP tab in settings
 */
export async function openMcpTab() {
	await navigateToTab(SELECTORS.tabs.mcp);
	const toolbar = await $(SELECTORS.mcp.toolbar);
	await toolbar.waitForDisplayed();
}

// --- Server Management ---

/**
 * Add a new MCP server
 */
export async function addMcpServer(config: MCPServerConfig) {
	const addButton = await $(SELECTORS.mcp.addButton);
	await addButton.click();
	await browser.pause(500);

	await fillMcpServerForm(config);

	const saveButton = await $(SELECTORS.mcp.modal.saveButton);
	await saveButton.click();
	await browser.pause(1000); // Wait for list update
}

/**
 * Edit an existing MCP server
 */
export async function editMcpServer(serverName: string, updates: Partial<MCPServerConfig>) {
	const editBtn = await $(SELECTORS.mcp.editButton(serverName));
	await editBtn.scrollIntoView();
	await editBtn.click();
	await browser.pause(500);

	await fillMcpServerForm(updates);

	const saveButton = await $(SELECTORS.mcp.modal.saveButton);
	await saveButton.click();
	await browser.pause(1000);
}

/**
 * Fill the MCP server form (used for both add and edit)
 */
async function fillMcpServerForm(config: Partial<MCPServerConfig>) {
	const modal = await $(SELECTORS.mcp.modal.container);
	await modal.waitForDisplayed();

	if (config.name) {
		const nameInput = await $(SELECTORS.mcp.modal.nameInput);
		await nameInput.setValue(config.name);
	}

	if (config.command) {
		const cmdInput = await $(SELECTORS.mcp.modal.commandInput);
		await cmdInput.setValue(config.command);
	}

	if (config.args !== undefined) {
		const argsInput = await $(SELECTORS.mcp.modal.argsInput);
		await argsInput.setValue(config.args.join(' '));
	}

	if (config.env !== undefined) {
		const envInput = await $(SELECTORS.mcp.modal.envTextarea);
		const envString = Object.entries(config.env)
			.map(([k, v]) => `${k}=${v}`)
			.join('\n');
		await envInput.setValue(envString);
	}

	if (config.connectionMode) {
		const modeSelect = await $(SELECTORS.mcp.modal.connectionModeDropdown);
		await modeSelect.selectByAttribute('value', config.connectionMode);
	}

	if (config.enabled !== undefined) {
		const toggle = await $(SELECTORS.mcp.modal.enabledToggle);
		const classList = await toggle.getAttribute('class');
		const isChecked = classList.includes('is-enabled');

		if (isChecked !== config.enabled) {
			await toggle.click();
		}
	}
}

/**
 * Delete an MCP server
 */
export async function deleteMcpServer(serverName: string, confirm: boolean = true) {
	const deleteBtn = await $(SELECTORS.mcp.deleteButton(serverName));
	await deleteBtn.scrollIntoView();
	
	// Use execute to force click and avoid "element click intercepted" error
	await browser.execute((el) => {
		el.dispatchEvent(new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			view: window
		}));
	}, deleteBtn);
	
	await browser.pause(500);

	if (confirm) {
		const modals = await $$('.modal');
		const lastModal = modals[modals.length - 1];
		const confirmBtn = await lastModal.$('button*=Confirm');
		
		if (await confirmBtn.isDisplayed()) {
			await confirmBtn.click();
		}
	}
	await browser.pause(1000);
}

/**
 * Check if an MCP server exists in the list
 */
export async function isMcpServerExists(serverName: string): Promise<boolean> {
	const row = await $(SELECTORS.mcp.serverRow(serverName));
	return await row.isExisting();
}

/**
 * Get list of all MCP server names
 */
export async function getMcpServers(): Promise<string[]> {
	const rows = await $$(SELECTORS.mcp.tableRows);
	const names: string[] = [];

	for (const row of rows) {
		const nameCell = await row.$(SELECTORS.mcp.nameCell);
		// Name cell might contain "Name\nEnv vars: 2", so we need to parse it
		const text = await nameCell.getText();
		const name = text.split('\n')[0];
		names.push(name);
	}
	return names;
}

// --- Connection Management ---

/**
 * Connect to an MCP server manually
 */
export async function connectMcpServer(serverName: string) {
	const connectBtn = await $(SELECTORS.mcp.connectButton(serverName));
	if (await connectBtn.isExisting()) {
		await connectBtn.click();
		await browser.pause(2000); // Wait for connection
	}
}

/**
 * Disconnect from an MCP server
 */
export async function disconnectMcpServer(serverName: string) {
	const disconnectBtn = await $(SELECTORS.mcp.disconnectButton(serverName));
	if (await disconnectBtn.isExisting()) {
		await disconnectBtn.click();
		await browser.pause(1000);
	}
}

/**
 * Get status of an MCP server
 */
export async function getMcpServerStatus(serverName: string): Promise<'connected' | 'disconnected' | 'disabled' | 'unknown'> {
	const row = await $(SELECTORS.mcp.serverRow(serverName));
	if (!await row.isExisting()) return 'unknown';

	const statusBadge = await row.$(SELECTORS.mcp.statusBadge);
	if (await statusBadge.isExisting()) {
		const text = await statusBadge.getText();
		return text.toLowerCase() as any;
	}
	return 'unknown';
}

// --- Tool Management ---

/**
 * Get tool count for a server
 */
export async function getMcpToolCount(serverName: string): Promise<number> {
	const badge = await $(SELECTORS.mcp.toolCountBadge(serverName));
	if (await badge.isExisting()) {
		const text = await badge.getText();
		return parseInt(text, 10);
	}
	return 0;
}

/**
 * Refresh all tools
 */
export async function refreshAllMcpTools() {
	const refreshBtn = await $(SELECTORS.mcp.refreshAllButton);
	await refreshBtn.click();
	await browser.pause(2000);
}

// --- Inspector ---

/**
 * Open MCP Inspector
 */
export async function openMcpInspector() {
	const btn = await $(SELECTORS.mcp.inspectorButton);
	await btn.click();
	await browser.pause(1000);
}

/**
 * Close MCP Inspector
 */
export async function closeMcpInspector() {
	await closeAllModals();
}

// --- Clean up ---

/**
 * Remove all test MCP servers
 */
export async function cleanMcpServers() {
	const servers = await getMcpServers();
	for (const server of servers) {
		if (server.startsWith('TestServer') || server.includes('AutoTest')) {
			await deleteMcpServer(server, true);
		}
	}
}

// --- Backward Compatibility Aliases ---

/**
 * Alias for openMcpTab (uppercase MCP)
 */
export async function openMCPTab() {
	return openMcpTab();
}

/**
 * Click the "Add Server" button to open the modal without filling the form
 */
export async function clickAddMCPServer() {
	const addButton = await $(SELECTORS.mcp.addButton);
	await addButton.click();
	await browser.pause(500);

	const modal = await $(SELECTORS.mcp.modal.container);
	await modal.waitForDisplayed({ timeout: 5000, timeoutMsg: 'MCP server modal not displayed' });

	// Wait for modal content to be fully rendered (wait for server name input to exist)
	const nameInput = await $(SELECTORS.mcp.modal.nameInput);
	await nameInput.waitForExist({ timeout: 5000, timeoutMsg: 'Server name input not found - modal content not ready' });

	// Also wait for Save button to ensure modal footer is rendered
	const saveBtn = await $(SELECTORS.mcp.modal.saveButton);
	await saveBtn.waitForExist({ timeout: 5000, timeoutMsg: 'Save button not found - modal footer not ready' });

	await browser.pause(200); // Small pause to ensure all form elements are rendered
}