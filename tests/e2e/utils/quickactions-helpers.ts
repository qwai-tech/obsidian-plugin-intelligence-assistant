/**
 * Helper functions for Quick Actions settings E2E tests
 */

import { SELECTORS } from './selectors';
import { navigateToTab } from './actions';

/**
 * Quick Action configuration interface for tests
 */
export interface QuickActionConfig {
	name: string;
	enabled?: boolean;
	actionType?: 'replace' | 'explain';
	model?: string;
	prompt?: string;
}

// === Navigation ===

/**
 * Open the Quick Actions tab in settings
 */
export async function openQuickActionsTab() {
	await navigateToTab(SELECTORS.quickActions.tab);
	const tabContent = await $(SELECTORS.quickActions.tabContent);
	await tabContent.waitForDisplayed({ timeout: 5000 });
}

/**
 * Get action summary (total and enabled counts)
 */
export async function getActionSummary(): Promise<{ total: number; enabled: number }> {
	const summaryEl = await $(SELECTORS.quickActions.summaryText);
	const text = await summaryEl.getText();

	// Parse text like "5 actions configured (3 enabled)"
	const totalMatch = text.match(/(\d+)\s+action/);
	const enabledMatch = text.match(/\((\d+)\s+enabled\)/);

	return {
		total: totalMatch ? parseInt(totalMatch[1], 10) : 0,
		enabled: enabledMatch ? parseInt(enabledMatch[1], 10) : 0,
	};
}

// === Action Prefix ===

/**
 * Get the current action prefix
 */
export async function getActionPrefix(): Promise<string> {
	const input = await $(SELECTORS.quickActions.prefixInput);
	return await input.getValue();
}

/**
 * Set the action prefix
 */
export async function setActionPrefix(prefix: string) {
	const input = await $(SELECTORS.quickActions.prefixInput);
	await input.setValue(prefix);
	await input.click(); // Blur to trigger save
	await browser.pause(300);
}

// === Quick Actions Table ===

/**
 * Get list of all quick action names
 */
export async function getQuickActions(): Promise<string[]> {
	const rows = await $$(SELECTORS.quickActions.tableRows);
	const actionNames: string[] = [];

	for (const row of rows) {
		const nameCell = await row.$('.ia-table-title');
		if (await nameCell.isExisting()) {
			const text = await nameCell.getText();
			actionNames.push(text);
		}
	}

	return actionNames;
}

/**
 * Check if a quick action exists
 */
export async function isQuickActionExists(actionName: string): Promise<boolean> {
	const actionRow = await $(SELECTORS.quickActions.actionRow(actionName));
	return await actionRow.isExisting();
}

/**
 * Get the total count of quick actions
 */
export async function getQuickActionCount(): Promise<number> {
	const actions = await getQuickActions();
	return actions.length;
}

/**
 * Check if empty state is displayed
 */
export async function hasQuickActionsEmptyState(): Promise<boolean> {
	const emptyState = await $(SELECTORS.quickActions.emptyState);
	return (await emptyState.isExisting()) && (await emptyState.isDisplayed());
}

// === CRUD Operations ===

/**
 * Add a new quick action
 */
export async function addQuickAction(config: QuickActionConfig) {
	const addButton = await $(SELECTORS.quickActions.addButton);
	await addButton.click();
	await browser.pause(500);

	// Modal should open with default values
	const modal = await $(SELECTORS.quickActions.modal.container);
	await modal.waitForDisplayed({ timeout: 5000 });

	// Fill the form
	await fillQuickActionForm(config);

	// Save the action
	await saveQuickActionModal();
}

/**
 * Edit an existing quick action
 */
export async function editQuickAction(actionName: string, updates: Partial<QuickActionConfig>) {
	const editButton = await $(SELECTORS.quickActions.editButton(actionName));
	await editButton.click();
	await browser.pause(500);

	// Modal should open
	const modal = await $(SELECTORS.quickActions.modal.container);
	await modal.waitForDisplayed({ timeout: 5000 });

	// Fill the form with updates
	await fillQuickActionForm(updates);

	// Save the changes
	await saveQuickActionModal();
}

/**
 * Delete a quick action
 */
export async function deleteQuickAction(actionName: string, confirm = true) {
	const deleteButton = await $(SELECTORS.quickActions.deleteButton(actionName));
	await deleteButton.click();
	await browser.pause(500);

	if (confirm) {
		// Confirm deletion (press Enter on confirmation dialog)
		await browser.keys('Enter');
		await browser.pause(500);
	} else {
		// Cancel deletion (press Escape)
		await browser.keys('Escape');
		await browser.pause(500);
	}
}

// === Enable/Disable ===

/**
 * Check if a quick action is enabled
 */
export async function isQuickActionEnabled(actionName: string): Promise<boolean> {
	const checkbox = await $(SELECTORS.quickActions.enableCheckbox(actionName));
	return await checkbox.isSelected();
}

/**
 * Toggle a quick action on/off
 */
export async function toggleQuickAction(actionName: string, enabled: boolean) {
	const isCurrentlyEnabled = await isQuickActionEnabled(actionName);

	if (isCurrentlyEnabled !== enabled) {
		const checkbox = await $(SELECTORS.quickActions.enableCheckbox(actionName));
		await checkbox.click();
		await browser.pause(500);
	}
}

// === Action Details ===

/**
 * Get the action type of a quick action
 */
export async function getQuickActionType(actionName: string): Promise<'replace' | 'explain'> {
	const typeBadge = await $(SELECTORS.quickActions.typeBadge(actionName));
	const text = await typeBadge.getText();
	return text.toLowerCase() as 'replace' | 'explain';
}

/**
 * Get the model name of a quick action
 */
export async function getQuickActionModel(actionName: string): Promise<string> {
	const modelCell = await $(SELECTORS.quickActions.modelCell(actionName));
	const modelEl = await modelCell.$('.ia-table-title');
	return await modelEl.getText();
}

/**
 * Get the prompt preview of a quick action
 */
export async function getQuickActionPrompt(actionName: string): Promise<string> {
	const promptPreview = await $(SELECTORS.quickActions.promptPreview(actionName));
	return await promptPreview.getText();
}

// === Modal Operations ===

/**
 * Open the quick action modal (for new or edit)
 */
export async function openQuickActionModal(actionName?: string) {
	if (actionName) {
		// Edit existing action
		const editButton = await $(SELECTORS.quickActions.editButton(actionName));
		await editButton.click();
	} else {
		// Add new action
		const addButton = await $(SELECTORS.quickActions.addButton);
		await addButton.click();
	}

	const modal = await $(SELECTORS.quickActions.modal.container);
	await modal.waitForDisplayed({ timeout: 5000 });
	await browser.pause(500);
}

/**
 * Close the quick action modal
 */
export async function closeQuickActionModal() {
	const modal = await $(SELECTORS.quickActions.modal.container);
	if (await modal.isDisplayed()) {
		await browser.keys('Escape');
		await modal.waitForDisplayed({ timeout: 3000, reverse: true });
	}
}

/**
 * Check if quick action modal is open
 */
export async function isQuickActionModalOpen(): Promise<boolean> {
	const modal = await $(SELECTORS.quickActions.modal.container);
	return await modal.isDisplayed();
}

/**
 * Fill the quick action form in the modal
 */
export async function fillQuickActionForm(config: Partial<QuickActionConfig>) {
	const modal = await $(SELECTORS.quickActions.modal.container);
	await modal.waitForDisplayed({ timeout: 5000 });

	if (config.name !== undefined) {
		const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
		await nameInput.setValue(config.name);
		await browser.pause(300);
	}

	if (config.actionType !== undefined) {
		const dropdown = await $(SELECTORS.quickActions.modal.actionTypeDropdown);
		const typeText = config.actionType === 'replace' ? 'Replace selected text' : 'Show in modal';
		await dropdown.selectByVisibleText(typeText);
		await browser.pause(300);
	}

	if (config.model !== undefined) {
		const dropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
		if (config.model === '' || config.model.toLowerCase() === 'default') {
			await dropdown.selectByVisibleText('Use default model');
		} else {
			await dropdown.selectByVisibleText(config.model);
		}
		await browser.pause(300);
	}

	if (config.prompt !== undefined) {
		const textarea = await $(SELECTORS.quickActions.modal.promptTextarea);
		await textarea.setValue(config.prompt);
		await browser.pause(300);
	}
}

/**
 * Save the quick action modal
 */
export async function saveQuickActionModal() {
	const saveButton = await $(SELECTORS.quickActions.modal.saveButton);
	await saveButton.click();

	const modal = await $(SELECTORS.quickActions.modal.container);
	await modal.waitForDisplayed({ timeout: 3000, reverse: true });
	await browser.pause(500);
}

/**
 * Cancel the quick action modal
 */
export async function cancelQuickActionModal() {
	const cancelButton = await $(SELECTORS.quickActions.modal.cancelButton);
	await cancelButton.click();

	const modal = await $(SELECTORS.quickActions.modal.container);
	await modal.waitForDisplayed({ timeout: 3000, reverse: true });
	await browser.pause(500);
}

// === Model Selection ===

/**
 * Get available models from the dropdown
 */
export async function getAvailableModels(): Promise<string[]> {
	// Open modal first
	await openQuickActionModal();

	const dropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
	const options = await dropdown.$$('option');
	const models: string[] = [];

	for (const option of options) {
		const text = await option.getText();
		if (text !== 'Use default model') {
			models.push(text);
		}
	}

	// Close modal
	await closeQuickActionModal();

	return models;
}

/**
 * Select a model in the modal
 */
export async function selectModel(modelName: string) {
	const dropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
	await dropdown.selectByVisibleText(modelName);
	await browser.pause(300);
}

// === Validation Helpers ===

/**
 * Check if add button is displayed
 */
export async function isAddButtonDisplayed(): Promise<boolean> {
	const addButton = await $(SELECTORS.quickActions.addButton);
	return await addButton.isDisplayed();
}

/**
 * Check if usage info is displayed
 */
export async function hasUsageInfo(): Promise<boolean> {
	const usageInfo = await $(SELECTORS.quickActions.usageInfo);
	return (await usageInfo.isExisting()) && (await usageInfo.isDisplayed());
}
