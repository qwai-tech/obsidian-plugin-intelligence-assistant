/**
 * Helper functions for LLM settings E2E tests
 */

import { SELECTORS } from './selectors';
import { closeSettings } from './actions'; // Import closeSettings is needed here for cleanProviders
import { navigateToPluginSettings } from './actions'; // Explicitly import here


// Define all helper functions as properties of a single object
const exportedFunctions = {
	async openLlmTab() {
		await navigateToPluginSettings();
		const llmTab = await $(SELECTORS.tabs.llm);
		await llmTab.waitForExist({ timeout: 5000, timeoutMsg: 'LLM tab not found' });
		await llmTab.click();
		await browser.pause(300);
	},

	async switchLlmSubtab(subTab: 'providers' | 'models') {
		const label = subTab === 'providers' ? 'Providers' : 'Models';
		const subTabButton = await $(`.ia-llm-subtab-btn*=${label}`);
		await subTabButton.waitForExist({ timeout: 5000, timeoutMsg: `${label} sub-tab button not found` });
		await subTabButton.click();
		await browser.pause(300);
	},

	async addProvider(config: {
		provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'ollama' | 'openrouter' | 'sap-ai-core' | 'custom';
		apiKey?: string;
		baseUrl?: string;
		serviceKey?: string;
		modelFilter?: string;
		resourceGroup?: string;
	}) {
		const addBtn = await $(SELECTORS.llm.addProviderButton);
		await addBtn.waitForExist({ timeout: 5000, timeoutMsg: 'Add Provider button not found' });
		await addBtn.click();
		await browser.pause(300);

		const modal = await $(SELECTORS.llm.modal.container);
		await modal.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Provider settings modal not displayed' });

		const providerDropdown = await $(SELECTORS.llm.modal.providerDropdown);
		await providerDropdown.waitForExist({ timeout: 5000, timeoutMsg: 'Provider dropdown not found' });
		await providerDropdown.selectByAttribute('value', config.provider);
		await browser.pause(200);

		if (config.apiKey) {
			const apiKeyInput = await $(SELECTORS.llm.modal.apiKeyInput);
			if (await apiKeyInput.isExisting()) {
				await apiKeyInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'API Key input not displayed' });
				await apiKeyInput.setValue(config.apiKey);
			}
		}

		if (config.baseUrl) {
			const baseUrlInput = await $(SELECTORS.llm.modal.baseUrlInput);
			if (await baseUrlInput.isExisting()) {
				await baseUrlInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'Base URL input not displayed' });
				await baseUrlInput.setValue(config.baseUrl);
			}
		}

		if (config.serviceKey) {
			const serviceKeyInput = await $(SELECTORS.llm.modal.serviceKeyInput);
			if (await serviceKeyInput.isExisting()) {
				await serviceKeyInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'Service Key input not displayed' });
				await serviceKeyInput.setValue(config.serviceKey);
			}
		}

		if (config.modelFilter) {
			const modelFilterInput = await $(SELECTORS.llm.modal.modelFilterInput);
			if (await modelFilterInput.isExisting()) {
				await modelFilterInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'Model Filter input not displayed' });
				await modelFilterInput.setValue(config.modelFilter);
			}
		}

		if (config.resourceGroup) {
			const resourceGroupInput = await $(SELECTORS.llm.modal.resourceGroupInput);
			if (await resourceGroupInput.isExisting()) {
				await resourceGroupInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'Resource Group input not displayed' });
				await resourceGroupInput.setValue(config.resourceGroup);
			}
		}

		const saveBtn = await $(SELECTORS.llm.modal.saveButton);
		await saveBtn.waitForExist({ timeout: 3000, timeoutMsg: 'Save button not found' });
		await saveBtn.click();
		await modal.waitForDisplayed({ reverse: true, timeout: 5000, timeoutMsg: 'Provider settings modal did not close after save' });
		await browser.pause(1000); // Increased wait time for provider row to fully render
	},

	async editProvider(providerName: string, updates: {
		apiKey?: string;
		baseUrl?: string;
		modelFilter?: string;
	}) {
		const editBtn = await $(SELECTORS.llm.editButton(providerName));
		await editBtn.waitForExist({ timeout: 5000, timeoutMsg: `Edit button for ${providerName} not found` });
		await editBtn.click();
		await browser.pause(300);

		const modal = await $(SELECTORS.llm.modal.container);
		await modal.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Provider settings modal not displayed for editing' });

		if (updates.apiKey !== undefined) {
			const apiKeyInput = await $(SELECTORS.llm.modal.apiKeyInput);
			if (await apiKeyInput.isExisting()) {
				await apiKeyInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'API Key input not displayed for editing' });
				await apiKeyInput.clearValue();
				await apiKeyInput.setValue(updates.apiKey);
			}
		}

		if (updates.baseUrl !== undefined) {
			const baseUrlInput = await $(SELECTORS.llm.modal.baseUrlInput);
			if (await baseUrlInput.isExisting()) {
				await baseUrlInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'Base URL input not displayed for editing' });
				await baseUrlInput.clearValue();
				await baseUrlInput.setValue(updates.baseUrl);
			}
		}

		if (updates.modelFilter !== undefined) {
			const modelFilterInput = await $(SELECTORS.llm.modal.modelFilterInput);
			if (await modelFilterInput.isExisting()) {
				await modelFilterInput.waitForDisplayed({ timeout: 3000, timeoutMsg: 'Model Filter input not displayed for editing' });
				await modelFilterInput.clearValue();
				await modelFilterInput.setValue(updates.modelFilter);
			}
		}

		const saveBtn = await $(SELECTORS.llm.modal.saveButton);
		await saveBtn.waitForExist({ timeout: 3000, timeoutMsg: 'Save button not found for editing' });
		await saveBtn.click();
		await modal.waitForDisplayed({ reverse: true, timeout: 5000, timeoutMsg: 'Provider settings modal did not close after edit save' });
		await browser.pause(500);
	},

	async deleteProvider(providerName: string, confirm: boolean = true) {
		const rows = await $$(SELECTORS.llm.tableRows);
		let deleteBtn;
		for (const row of rows) {
			const nameEl = await row.$('.ia-provider-name');
			if (await nameEl.isExisting() && (await nameEl.getText()).includes(providerName)) {
				deleteBtn = await row.$('button*=Delete');
				break;
			}
		}

		if (!deleteBtn || !(await deleteBtn.isExisting())) {
			throw new Error(`Delete button for ${providerName} not found`);
		}

		// Use execute to force click and avoid "element click intercepted" error
		console.log("Executing force click for delete button");
		await browser.execute((el) => {
			el.dispatchEvent(new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				view: window
			}));
		}, deleteBtn);
		await browser.pause(300);

		const modals = await $$('.modal');
		const lastModal = modals[modals.length - 1];
		const confirmBtn = await lastModal.$('button*=Confirm');
		const cancelBtn = await lastModal.$('button*=Cancel');

		if (confirm) {
			await confirmBtn.waitForExist({ timeout: 3000, timeoutMsg: 'Confirm delete button not found' });
			await confirmBtn.click();
			await browser.pause(500);
		} else {
			await cancelBtn.waitForExist({ timeout: 3000, timeoutMsg: 'Cancel delete button not found' });
			await cancelBtn.click();
			await browser.pause(300);
		}
	},

	async refreshProviderModels(providerName: string) {
		const refreshBtn = await $(SELECTORS.llm.refreshButton(providerName));
		await refreshBtn.waitForExist({ timeout: 5000, timeoutMsg: `Refresh button for ${providerName} not found` });
		await refreshBtn.click();
		await browser.pause(1000);
	},

	async refreshAllModels() {
		await exportedFunctions.switchLlmSubtab('models');

		const refreshAllBtn = await $(SELECTORS.llm.refreshAllButton);
		await refreshAllBtn.waitForExist({ timeout: 5000, timeoutMsg: 'Refresh All Models button not found' });
		await refreshAllBtn.click();
		await browser.pause(2000);
	},

	async filterModels(filters: {
		provider?: string;
		capability?: string;
		status?: 'all' | 'enabled' | 'disabled';
		search?: string;
	}) {
		await exportedFunctions.switchLlmSubtab('models');

		if (filters.provider) {
			const providerFilter = await $(SELECTORS.llm.providerFilterDropdown);
			await providerFilter.waitForExist({ timeout: 3000, timeoutMsg: 'Provider filter dropdown not found' });
			await providerFilter.selectByAttribute('value', filters.provider);
			await browser.pause(200);
		}

		if (filters.capability) {
			const capabilityFilter = await $(SELECTORS.llm.capabilityFilterDropdown);
			await capabilityFilter.waitForExist({ timeout: 3000, timeoutMsg: 'Capability filter dropdown not found' });
			await capabilityFilter.selectByAttribute('value', filters.capability);
			await browser.pause(200);
		}

		if (filters.status) {
			const statusFilter = await $(SELECTORS.llm.statusFilterDropdown);
			await statusFilter.waitForExist({ timeout: 3000, timeoutMsg: 'Status filter dropdown not found' });
			await statusFilter.selectByAttribute('value', filters.status);
			await browser.pause(200);
		}

		if (filters.search !== undefined) {
			const searchInput = await $(SELECTORS.llm.searchInput);
			await searchInput.waitForExist({ timeout: 3000, timeoutMsg: 'Search input not found' });
			await searchInput.setValue(filters.search);
			await browser.pause(300);
		}
	},

	async toggleModel(modelName: string) {
		const modelRow = await $(SELECTORS.llm.modelRow(modelName));
		await modelRow.waitForExist({ timeout: 5000, timeoutMsg: `Model row for ${modelName} not found` });
		const toggleBtn = await modelRow.$('button*=Enable, button*=Disable');
		await toggleBtn.waitForExist({ timeout: 3000, timeoutMsg: `Toggle button for ${modelName} not found` });
		await toggleBtn.click();
		await browser.pause(300);
	},

	async getProviderStatus(providerName: string): Promise<string> {
		const providerRow = await $(SELECTORS.llm.providerRow(providerName));
		await providerRow.waitForExist({ timeout: 5000, timeoutMsg: `Provider row for ${providerName} not found` });
		const statusBadge = await providerRow.$(SELECTORS.llm.statusBadge);
		await statusBadge.waitForExist({ timeout: 3000, timeoutMsg: `Status badge for ${providerName} not found` });
		return await statusBadge.getText();
	},

	async getModelStatus(modelName: string): Promise<string> {
		const modelRow = await $(SELECTORS.llm.modelRow(modelName));
		await modelRow.waitForExist({ timeout: 5000, timeoutMsg: `Model row for ${modelName} not found` });
		const statusBadge = await modelRow.$(SELECTORS.llm.statusBadge);
		await statusBadge.waitForExist({ timeout: 3000, timeoutMsg: `Status badge for ${modelName} not found` });
		return await statusBadge.getText();
	},

	async getVisibleModelCount(): Promise<number> {
		const rows = await $$(SELECTORS.llm.tableRows);
		return rows.length;
	},

	async getAllProviderNames(): Promise<string[]> {
		await exportedFunctions.switchLlmSubtab('providers');
		await browser.pause(1500); // Increased wait time for DOM stabilization after subtab switch

		const providerRows = await $$(SELECTORS.llm.tableRows);
		const configuredProviderNames: string[] = [];

		for (const row of providerRows) {
			const providerNameElement = await row.$('.ia-provider-name');
			const actionsContainer = await row.$('.ia-table-actions');

			if (await providerNameElement.isExisting() && await actionsContainer.isExisting()) {
				const deleteButton = await actionsContainer.$('button*=Delete');
				if (await deleteButton.isExisting()) {
					const name = await providerNameElement.getText();
					configuredProviderNames.push(name);
				}
			}
		}
		return configuredProviderNames;
	},

	async getAllModelNames(): Promise<string[]> {
		const rows = await $$(SELECTORS.llm.tableRows);
		const names: string[] = [];

		for (const row of rows) {
			const nameEl = await row.$('.ia-provider-name');
			if (await nameEl.isExisting()) {
				const name = await nameEl.getText();
				names.push(name);
			}
		}
		return names;
	},

	async providerExists(providerName: string): Promise<boolean> {
		const names = await exportedFunctions.getAllProviderNames();
		return names.some(name => name.includes(providerName));
	},

	async modelExists(modelName: string): Promise<boolean> {
		const names = await exportedFunctions.getAllModelNames();
		return names.includes(modelName);
	},

	async waitForProvider(providerName: string, timeout: number = 5000) {
		await browser.waitUntil(
			async () => await exportedFunctions.providerExists(providerName),
			{
				timeout,
				timeoutMsg: `Provider "${providerName}" did not appear within ${timeout}ms`
			}
		);
		// Additional wait after finding provider to ensure DOM is fully stable
		await browser.pause(500);
	},

	async waitForProviderRemoval(providerName: string, timeout: number = 5000) {
		await browser.waitUntil(
			async () => !(await exportedFunctions.providerExists(providerName)),
			{
				timeout,
				timeoutMsg: `Provider "${providerName}" was not removed within ${timeout}ms`
			}
		);
	},

	async waitForModels(minCount: number = 1, timeout: number = 10000) {
		await browser.waitUntil(
			async () => {
				const count = await exportedFunctions.getVisibleModelCount();
				return count >= minCount;
			},
			{
				timeout,
				timeoutMsg: `Expected at least ${minCount} models, but timeout reached`
			}
		);
	},

	async waitForModelStatus(modelName: string, expectedStatus: 'enabled' | 'disabled', timeout: number = 3000) {
		await browser.waitUntil(
			async () => {
				const status = await exportedFunctions.getModelStatus(modelName);
				return status.toLowerCase().includes(expectedStatus);
			},
			{
				timeout,
				timeoutMsg: `Model "${modelName}" status did not change to "${expectedStatus}" within ${timeout}ms`
			}
		);
	},

	async cleanProviders() {
		await exportedFunctions.openLlmTab();
		await exportedFunctions.switchLlmSubtab('providers');

		let providerNames = await exportedFunctions.getAllProviderNames();
		console.log(`[cleanProviders] Found providers to delete: ${providerNames.join(', ')}`);
		while (providerNames.length > 0) {
			await exportedFunctions.deleteProvider(providerNames[0]);
			await exportedFunctions.waitForProviderRemoval(providerNames[0]);
			providerNames = await exportedFunctions.getAllProviderNames();
		}
		await closeSettings();
	},

	// Alias for backward compatibility (uppercase LLM)
	async openLLMTab() {
		return exportedFunctions.openLlmTab();
	},

	// Click the "Add Provider" button to open the modal
	async clickAddProvider() {
		const addBtn = await $(SELECTORS.llm.addProviderButton);
		await addBtn.waitForExist({ timeout: 5000, timeoutMsg: 'Add Provider button not found' });
		await addBtn.click();
		await browser.pause(300);

		const modal = await $(SELECTORS.llm.modal.container);
		await modal.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Provider settings modal not displayed' });

		// Wait for modal content to be fully rendered (wait for provider dropdown to exist)
		const providerDropdown = await $(SELECTORS.llm.modal.providerDropdown);
		await providerDropdown.waitForExist({ timeout: 5000, timeoutMsg: 'Provider dropdown not found - modal content not ready' });

		// Also wait for Save button to ensure modal footer is rendered
		const saveBtn = await $(SELECTORS.llm.modal.saveButton);
		await saveBtn.waitForExist({ timeout: 5000, timeoutMsg: 'Save button not found - modal footer not ready' });

		await browser.pause(200); // Small pause to ensure all form elements are rendered
	},

	// Click the save button in the provider config modal
	async saveProviderConfig() {
		const modal = await $(SELECTORS.llm.modal.container);
		const saveBtn = await $(SELECTORS.llm.modal.saveButton);
		await saveBtn.waitForExist({ timeout: 3000, timeoutMsg: 'Save button not found' });
		await saveBtn.click();
		await modal.waitForDisplayed({ reverse: true, timeout: 5000, timeoutMsg: 'Provider settings modal did not close after save' });
		await browser.pause(1000); // Increased wait time for provider row to fully render
	},

	// Alias for getAllProviderNames (different name in some tests)
	async getProviderList(): Promise<string[]> {
		return exportedFunctions.getAllProviderNames();
	},

	// Alias for switchLlmSubtab (capital T vs lowercase t)
	async switchLlmSubTab(subTab: 'providers' | 'models') {
		return exportedFunctions.switchLlmSubtab(subTab);
	},
};

// Export all functions
export const {
	openLlmTab,
	switchLlmSubtab,
	addProvider,
	editProvider,
	deleteProvider,
	refreshProviderModels,
	refreshAllModels,
	filterModels,
	toggleModel,
	getProviderStatus,
	getModelStatus,
	getVisibleModelCount,
	getAllProviderNames,
	getAllModelNames,
	providerExists,
	modelExists,
	waitForProvider,
	waitForProviderRemoval,
	waitForModels,
	waitForModelStatus,
	cleanProviders,
	openLLMTab,
	clickAddProvider,
	saveProviderConfig,
	getProviderList,
	switchLlmSubTab,
} = exportedFunctions;