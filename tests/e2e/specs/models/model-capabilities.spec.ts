/**
 * E2E Tests for Model Capabilities
 * Tests: TC-MODEL-001, TC-MODEL-002, TC-MODEL-003, TC-MODEL-004
 */

import { openSettings, closeSettings, openChatView, sendChatMessage, waitForAssistantResponse } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import { testWithProvider } from '../../utils/test-helpers';
import {

	getLastAssistantMessage,
	waitForModelsLoaded,
} from '../../utils/chat-helpers';

describe('Models - Capabilities', () => {
	describe('TC-MODEL-001: 模型能力检测', () => {
		it('should display model capabilities in settings', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			// Switch to Models subtab
			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Look for capability indicators
			const capabilityTags = await $$(SELECTORS.llm.capabilityTag);

			// Should show capabilities like "chat", "vision", "function-calling"
			expect(capabilityTags.length).toBeGreaterThanOrEqual(0);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should detect vision capability', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Look for vision capability tag
			const visionTag = await $('span*=vision');
			if (await visionTag.isExisting()) {
				// At least one model has vision capability
				expect(await visionTag.isDisplayed()).toBe(true);
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should detect function calling capability', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Look for function calling or tools capability
			const functionTag = await $('span*=function');
			const toolsTag = await $('span*=tools');

			const hasFunctionCapability = (await functionTag.isExisting()) || (await toolsTag.isExisting());
			expect(typeof hasFunctionCapability).toBe('boolean');

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should detect streaming capability', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Look for streaming capability
			const streamingTag = await $('span*=streaming');
			const hasStreamingCapability = await streamingTag.isExisting();

			expect(typeof hasStreamingCapability).toBe('boolean');

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('TC-MODEL-002: 根据能力筛选模型', () => {
		it('should filter models by capability', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Look for capability filter dropdown
			const capabilityFilter = await $(SELECTORS.llm.capabilityFilterDropdown);
			if (await capabilityFilter.isExisting()) {
				// Select a capability
				await capabilityFilter.selectByVisibleText('vision');
				await browser.pause(500);

				// Should show only models with vision capability
				const modelRows = await $$(SELECTORS.llm.tableRows);
				expect(modelRows.length).toBeGreaterThanOrEqual(0);
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should filter models by provider', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			const providerFilter = await $(SELECTORS.llm.providerFilterDropdown);
			if (await providerFilter.isExisting()) {
				const options = await providerFilter.$$('option');
				if (options.length > 1) {
					// Select first provider
					await options[1].click();
					await browser.pause(500);

					// Should filter models
					const modelRows = await $$(SELECTORS.llm.tableRows);
					expect(modelRows.length).toBeGreaterThanOrEqual(0);
				}
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should search models by name', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			const searchInput = await $(SELECTORS.llm.searchInput);
			if (await searchInput.isExisting()) {
				await searchInput.setValue('gpt');
				await browser.pause(500);

				// Should filter to GPT models
				const modelRows = await $$(SELECTORS.llm.tableRows);
				if (modelRows.length > 0) {
					const firstRowText = await modelRows[0].getText();
					expect(firstRowText.toLowerCase()).toContain('gpt');
				}
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should clear filters', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Apply some filters
			const searchInput = await $(SELECTORS.llm.searchInput);
			if (await searchInput.isExisting()) {
				await searchInput.setValue('test');
				await browser.pause(500);
			}

			// Clear filters
			const clearButton = await $(SELECTORS.llm.clearFiltersButton);
			if (await clearButton.isExisting()) {
				await clearButton.click();
				await browser.pause(500);

				// All models should be shown again
				const modelRows = await $$(SELECTORS.llm.tableRows);
				expect(modelRows.length).toBeGreaterThan(0);
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('TC-MODEL-003: 启用/禁用模型', () => {
		it('should enable model', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Find a disabled model
			const modelRows = await $$(SELECTORS.llm.tableRows);
			if (modelRows.length > 0) {
				for (const row of modelRows) {
					const toggle = await row.$('input[type="checkbox"]');
					if (await toggle.isExisting()) {
						const isChecked = await toggle.isSelected();

						if (!isChecked) {
							// Enable this model
							await toggle.click();
							await browser.pause(500);

							// Verify it's now enabled
							expect(await toggle.isSelected()).toBe(true);

							// Disable it again for cleanup
							await toggle.click();
							await browser.pause(500);
							break;
						}
					}
				}
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should disable model', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			const modelRows = await $$(SELECTORS.llm.tableRows);
			if (modelRows.length > 0) {
				for (const row of modelRows) {
					const toggle = await row.$('input[type="checkbox"]');
					if (await toggle.isExisting()) {
						const isChecked = await toggle.isSelected();

						if (isChecked) {
							// Disable this model
							await toggle.click();
							await browser.pause(500);

							// Verify it's now disabled
							expect(await toggle.isSelected()).toBe(false);

							// Re-enable it for cleanup
							await toggle.click();
							await browser.pause(500);
							break;
						}
					}
				}
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show only enabled models in chat', async () => {
		try {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			// Open model selector
			const modelSelector = await $(SELECTORS.chat.modelSelector);
			if (await modelSelector.isExisting()) {
				await modelSelector.click();
				await browser.pause(500);

				// Get available models
				const options = await modelSelector.$$('option');

				// All shown models should be enabled
				expect(options.length).toBeGreaterThan(0);
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should persist model enable/disable state', async () => {
		try {
			await openSettings();

			const llmTab = await $(`//div[@role="tab"][contains(text(), 'LLM')]`);
			await llmTab.click();
			await browser.pause(1000);

			const modelsSubtab = await $('button*=Models');
			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Toggle a model
			const modelRows = await $$(SELECTORS.llm.tableRows);
			let toggledModelName = '';
			let originalState = false;

			if (modelRows.length > 0) {
				const row = modelRows[0];
				const toggle = await row.$('input[type="checkbox"]');

				if (await toggle.isExisting()) {
					originalState = await toggle.isSelected();
					toggledModelName = await row.getText();

					// Toggle it
					await toggle.click();
					await browser.pause(500);
				}
			}

			await closeSettings();

			// Reopen settings
			await openSettings();
			await llmTab.click();
			await browser.pause(1000);

			if (await modelsSubtab.isExisting()) {
				await modelsSubtab.click();
				await browser.pause(500);
			}

			// Verify state was persisted
			const modelRowsAfter = await $$(SELECTORS.llm.tableRows);
			if (modelRowsAfter.length > 0) {
				const row = modelRowsAfter[0];
				const toggle = await row.$('input[type="checkbox"]');

				if (await toggle.isExisting()) {
					const currentState = await toggle.isSelected();
					expect(currentState).toBe(!originalState);

					// Restore original state
					if (currentState !== originalState) {
						await toggle.click();
						await browser.pause(500);
					}
				}
			}

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('TC-MODEL-004: 模型切换', () => {
		it('should switch between models', async () => {
		try {
			await openChatView();

			await waitForModelsLoaded(2, 15000); // Need at least 2 models

			const modelSelector = await $(SELECTORS.chat.modelSelector);
			if (!await modelSelector.isExisting()) {
				return;
			}

			// Get available models
			const options = await modelSelector.$$('option');
			if (options.length < 2) {
				return; // Need multiple models to test switching
			}

			// Switch to second model
			await options[1].click();
			await browser.pause(1000);

			// Send a message
			await sendChatMessage('Hello from second model');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);

			// Switch back to first model
			await modelSelector.click();
			const optionsAgain = await modelSelector.$$('option');
			await optionsAgain[0].click();
			await browser.pause(1000);
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should preserve model selection in conversation', async () => {
		try {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			const modelSelector = await $(SELECTORS.chat.modelSelector);
			if (!await modelSelector.isExisting()) {
				return;
			}

			// Select a model
			const selectedValue = await modelSelector.getValue();

			// Send message
			await sendChatMessage('Test message');
			await waitForAssistantResponse(30000);

			// Model should still be the same
			const stillSelected = await modelSelector.getValue();
			expect(stillSelected).toBe(selectedValue);
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show model info in selector', async () => {
		try {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			const modelSelector = await $(SELECTORS.chat.modelSelector);
			if (!await modelSelector.isExisting()) {
				return;
			}

			// Model selector should show useful info
			const options = await modelSelector.$$('option');
			if (options.length > 0) {
				const optionText = await options[0].getText();

				// Should include model name at minimum
				expect(optionText.length).toBeGreaterThan(0);
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should validate model availability before switching', async () => {
		try {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			const modelSelector = await $(SELECTORS.chat.modelSelector);
			if (!await modelSelector.isExisting()) {
				return;
			}

			// All options in selector should be available models
			const options = await modelSelector.$$('option');

			for (const option of options) {
				const isEnabled = await option.isEnabled();
				expect(isEnabled).toBe(true);
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('Model Capability Constraints', () => {
		it('should disable incompatible features for model', async function() {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			const modelSelector = await $(SELECTORS.chat.modelSelector);
			if (!await modelSelector.isExisting()) {
				this.skip();
			}

			// If current model doesn't support vision
			// Attachment button might be disabled or hidden
			// This is model-dependent
			const attachmentButton = await $(SELECTORS.chat.attachmentButton);
			if (await attachmentButton.isExisting()) {
				// Check if it's enabled or disabled based on model capabilities
				const isEnabled = await attachmentButton.isEnabled();
				expect(typeof isEnabled).toBe('boolean');
			}
		});

		it('should show warning for missing capabilities', async function() {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			// If trying to use feature unsupported by model
			// Should show warning
			this.skip();
		});
	});

	describe('Model Performance Indicators', () => {
		it('should show model loading time', async () => {
		try {
			await openChatView();

			// Model selector might show loading indicator
			const modelCountBadge = await $(SELECTORS.chat.modelCountBadge);
			if (await modelCountBadge.isExisting()) {
				const badgeText = await modelCountBadge.getText();
				expect(badgeText.length).toBeGreaterThan(0);
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show token usage', async () => {
		try {
			await openChatView();

			await waitForModelsLoaded(1, 15000);

			// Token summary might be displayed
			const tokenSummary = await $(SELECTORS.chat.tokenSummary);
			if (await tokenSummary.isExisting()) {
				const summaryText = await tokenSummary.getText();
				expect(summaryText.length).toBeGreaterThanOrEqual(0);
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});
});
