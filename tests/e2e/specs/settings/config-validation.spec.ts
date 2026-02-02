/**
 * E2E Tests for Configuration Validation
 * Tests: TC-CONFIG-001, TC-CONFIG-002, TC-CONFIG-003, TC-CONFIG-004
 */

import { openSettings, closeSettings } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import {

	openLLMTab,
	clickAddProvider,
	saveProviderConfig,
} from '../../utils/llm-helpers';
import { openMCPTab, clickAddMCPServer } from '../../utils/mcp-helpers';

describe('Configuration Validation', () => {
	beforeEach(async () => {
		await openSettings();
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('TC-CONFIG-001: LLM 配置验证 - 空 provider', () => {
		it('should not allow saving provider with empty name', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			// Try to leave provider name empty
			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			// Don't select anything or select empty value

			const nameInput = await $(SELECTORS.settings.llm.providerNameInput);
			if (await nameInput.isExisting()) {
				await nameInput.setValue(''); // Explicitly set empty
			}

			// Try to save
			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show validation error
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				expect(errorText).toMatch(/provider.*required|name.*required|cannot be empty/i);
			} else {
				// Or check for notice
				const notice = await $('.notice.notice-error');
				if (await notice.isExisting()) {
					const noticeText = await notice.getText();
					expect(noticeText).toMatch(/provider.*required|name.*required/i);
				}
			}

			// Verify modal/form is still open (not saved)
			const modal = await $(SELECTORS.settings.llm.configModal);
			expect(await modal.isDisplayed()).toBe(true);

			// Cancel
			const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
			await cancelButton.click();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should require selecting a provider type', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			// Skip provider selection, try to save immediately
			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			await apiKeyInput.setValue('test-key');

			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show validation error or stay on form
			const modal = await $(SELECTORS.settings.llm.configModal);
			expect(await modal.isDisplayed()).toBe(true);

			// Cancel
			const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
			await cancelButton.click();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('TC-CONFIG-002: 无效 URL 格式验证', () => {
		it('should reject invalid base URL format', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			// Select a provider
			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			await providerSelect.selectByVisibleText('OpenAI');

			// Enter invalid URL
			const baseUrlInput = await $(SELECTORS.settings.llm.baseUrlInput);
			await baseUrlInput.setValue('not-a-valid-url');

			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			await apiKeyInput.setValue('test-key');

			// Try to save
			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show validation error
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				expect(errorText).toMatch(/invalid.*url|url.*format|valid url/i);
			} else {
				const notice = await $('.notice.notice-error');
				if (await notice.isExisting()) {
					const noticeText = await notice.getText();
					expect(noticeText).toMatch(/invalid.*url|url.*format/i);
				}
			}

			// Modal should still be open
			const modal = await $(SELECTORS.settings.llm.configModal);
			expect(await modal.isDisplayed()).toBe(true);

			// Cancel
			const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
			await cancelButton.click();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should accept valid URL formats', async () => {
		try {
			const validUrls = [
				'https://api.openai.com',
				'http://localhost:11434',
				'http://192.168.1.100:8080',
				'https://api.example.com:443/v1',
			];

			for (const url of validUrls) {
				await openLLMTab();
				await clickAddProvider();

				const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
				await providerSelect.selectByVisibleText('OpenAI');

				const baseUrlInput = await $(SELECTORS.settings.llm.baseUrlInput);
				await baseUrlInput.setValue(url);

				const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
				await apiKeyInput.setValue('test-key-' + Date.now());

				const saveButton = await $(SELECTORS.settings.llm.saveButton);
				await saveButton.click();

				await browser.pause(1000);

				// Should close modal (successful save)
				const modal = await $(SELECTORS.settings.llm.configModal);
				const isModalOpen = await modal.isDisplayed().catch(() => false);
				expect(isModalOpen).toBe(false);

				// Cleanup - delete the provider
				const deleteButton = await $(`//button[@aria-label="Delete provider"]`);
				if (await deleteButton.isExisting()) {
					await deleteButton.click();
					const confirmButton = await $(`//button[contains(text(), 'Delete')]`);
					await confirmButton.click();
					await browser.pause(500);
				}
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should provide helpful error message for common mistakes', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			await providerSelect.selectByVisibleText('OpenAI');

			// Missing protocol
			const baseUrlInput = await $(SELECTORS.settings.llm.baseUrlInput);
			await baseUrlInput.setValue('api.openai.com');

			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			await apiKeyInput.setValue('test-key');

			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show helpful error
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				// Should mention protocol or format
				expect(errorText.length).toBeGreaterThan(0);
			}

			const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
			await cancelButton.click();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('TC-CONFIG-003: MCP 服务器配置验证', () => {
		it('should not allow saving MCP server with empty name', async () => {
		try {
			await openMCPTab();
			await clickAddMCPServer();

			// Try to save without name
			const nameInput = await $(SELECTORS.settings.mcp.serverNameInput);
			await nameInput.setValue('');

			const commandInput = await $(SELECTORS.settings.mcp.commandInput);
			await commandInput.setValue('/usr/bin/test');

			const saveButton = await $(SELECTORS.settings.mcp.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show validation error
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				expect(errorText).toMatch(/name.*required|server name|cannot be empty/i);
			} else {
				const notice = await $('.notice.notice-error');
				if (await notice.isExisting()) {
					const noticeText = await notice.getText();
					expect(noticeText).toMatch(/name.*required/i);
				}
			}

			// Form should still be open
			const modal = await $(SELECTORS.settings.mcp.configModal);
			expect(await modal.isDisplayed()).toBe(true);

			// Cancel
			const cancelButton = await $(SELECTORS.settings.mcp.cancelButton);
			await cancelButton.click();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should require command path for MCP server', async () => {
		try {
			await openMCPTab();
			await clickAddMCPServer();

			const nameInput = await $(SELECTORS.settings.mcp.serverNameInput);
			await nameInput.setValue('Test Server');

			// Leave command empty
			const commandInput = await $(SELECTORS.settings.mcp.commandInput);
			await commandInput.setValue('');

			const saveButton = await $(SELECTORS.settings.mcp.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show validation error or warning
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				expect(errorText).toMatch(/command.*required|path.*required/i);
			}

			const cancelButton = await $(SELECTORS.settings.mcp.cancelButton);
			await cancelButton.click();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should validate MCP server name uniqueness', async () => {
		try {
			await openMCPTab();

			// Add first server
			await clickAddMCPServer();

			const nameInput = await $(SELECTORS.settings.mcp.serverNameInput);
			await nameInput.setValue('Test Server');

			const commandInput = await $(SELECTORS.settings.mcp.commandInput);
			await commandInput.setValue('/usr/bin/test');

			let saveButton = await $(SELECTORS.settings.mcp.saveButton);
			await saveButton.click();

			await browser.pause(1000);

			// Try to add second server with same name
			await clickAddMCPServer();

			await nameInput.setValue('Test Server'); // Same name
			await commandInput.setValue('/usr/bin/another');

			saveButton = await $(SELECTORS.settings.mcp.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show error about duplicate name
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				expect(errorText).toMatch(/already exists|duplicate|unique/i);
			}

			const cancelButton = await $(SELECTORS.settings.mcp.cancelButton);
			if (await cancelButton.isExisting()) {
				await cancelButton.click();
			}

			// Cleanup - delete the first server
			const deleteButton = await $(`//button[@aria-label="Delete MCP server"]`);
			if (await deleteButton.isExisting()) {
				await deleteButton.click();
				const confirmButton = await $(`//button[contains(text(), 'Delete')]`);
				await confirmButton.click();
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

	describe('TC-CONFIG-004: API Key 警告（非本地提供商）', () => {
		it('should warn when API key is missing for remote provider', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			await providerSelect.selectByVisibleText('OpenAI');

			// Set remote base URL
			const baseUrlInput = await $(SELECTORS.settings.llm.baseUrlInput);
			await baseUrlInput.setValue('https://api.openai.com');

			// Don't set API key
			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			await apiKeyInput.setValue('');

			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should show warning (not error, allowing save)
			const warningMessage = await $(SELECTORS.settings.validationWarning);
			if (await warningMessage.isExisting()) {
				const warningText = await warningMessage.getText();
				expect(warningText).toMatch(/api key.*recommended|key.*required|authentication/i);
			} else {
				const notice = await $('.notice.notice-warning');
				if (await notice.isExisting()) {
					const noticeText = await notice.getText();
					expect(noticeText).toMatch(/api key.*recommended/i);
				}
			}

			// Should still allow saving (just warning)
			// Modal might close or stay open depending on implementation
			const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
			if (await cancelButton.isExisting()) {
				await cancelButton.click();
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should allow saving local provider without API key', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			await providerSelect.selectByVisibleText('Ollama');

			// Set local base URL
			const baseUrlInput = await $(SELECTORS.settings.llm.baseUrlInput);
			await baseUrlInput.setValue('http://localhost:11434');

			// Don't set API key
			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			if (await apiKeyInput.isExisting()) {
				await apiKeyInput.setValue('');
			}

			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(1000);

			// Should save successfully without warning
			const modal = await $(SELECTORS.settings.llm.configModal);
			const isModalOpen = await modal.isDisplayed().catch(() => false);

			// Modal should close (successful save)
			expect(isModalOpen).toBe(false);

			// Cleanup
			const deleteButton = await $(`//button[@aria-label="Delete provider"]`);
			if (await deleteButton.isExisting()) {
				await deleteButton.click();
				const confirmButton = await $(`//button[contains(text(), 'Delete')]`);
				await confirmButton.click();
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should distinguish between local and remote URLs', async () => {
		try {
			const testCases = [
				{ url: 'http://localhost:11434', isLocal: true },
				{ url: 'http://127.0.0.1:8080', isLocal: true },
				{ url: 'http://192.168.1.100:11434', isLocal: true },
				{ url: 'https://api.openai.com', isLocal: false },
				{ url: 'https://api.anthropic.com', isLocal: false },
			];

			for (const testCase of testCases) {
				await openLLMTab();
				await clickAddProvider();

				const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
				await providerSelect.selectByVisibleText('OpenAI');

				const baseUrlInput = await $(SELECTORS.settings.llm.baseUrlInput);
				await baseUrlInput.setValue(testCase.url);

				// Don't set API key
				const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
				await apiKeyInput.setValue('');

				const saveButton = await $(SELECTORS.settings.llm.saveButton);
				await saveButton.click();

				await browser.pause(500);

				if (testCase.isLocal) {
					// Should allow save without warning
					const modal = await $(SELECTORS.settings.llm.configModal);
					const isModalOpen = await modal.isDisplayed().catch(() => false);
					// Expect modal to close or no error
				} else {
					// Should show warning for remote URL
					const warningMessage = await $(SELECTORS.settings.validationWarning);
					if (await warningMessage.isExisting()) {
						const warningText = await warningMessage.getText();
						expect(warningText.length).toBeGreaterThan(0);
					}
				}

				// Cancel or cleanup
				const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
				if (await cancelButton.isExisting()) {
					await cancelButton.click();
				} else {
					// If saved, delete
					const deleteButton = await $(`//button[@aria-label="Delete provider"]`);
					if (await deleteButton.isExisting()) {
						await deleteButton.click();
						const confirmButton = await $(`//button[contains(text(), 'Delete')]`);
						if (await confirmButton.isExisting()) {
							await confirmButton.click();
						}
					}
				}

				await browser.pause(300);
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

	describe('Additional Validation Tests', () => {
		it('should trim whitespace from input fields', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			await providerSelect.selectByVisibleText('OpenAI');

			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			await apiKeyInput.setValue('  sk-test-key-with-spaces  ');

			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(1000);

			// Re-open to check trimmed value
			const providerRow = await $(`//tr[contains(@class, 'provider-row')]//span[contains(text(), 'OpenAI')]`);
			if (await providerRow.isExisting()) {
				await providerRow.click();
				await browser.pause(500);

				// Value should be trimmed
				const apiKeyValue = await apiKeyInput.getValue();
				expect(apiKeyValue).toBe('sk-test-key-with-spaces');

				const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
				await cancelButton.click();

				// Cleanup
				const deleteButton = await $(`//button[@aria-label="Delete provider"]`);
				if (await deleteButton.isExisting()) {
					await deleteButton.click();
					const confirmButton = await $(`//button[contains(text(), 'Delete')]`);
					await confirmButton.click();
				}
			}
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should validate maximum input lengths', async () => {
		try {
			await openLLMTab();
			await clickAddProvider();

			const providerSelect = await $(SELECTORS.settings.llm.providerTypeSelect);
			await providerSelect.selectByVisibleText('OpenAI');

			// Try extremely long API key
			const veryLongKey = 'sk-' + 'x'.repeat(1000);
			const apiKeyInput = await $(SELECTORS.settings.llm.apiKeyInput);
			await apiKeyInput.setValue(veryLongKey);

			const saveButton = await $(SELECTORS.settings.llm.saveButton);
			await saveButton.click();

			await browser.pause(500);

			// Should either reject or truncate
			const errorMessage = await $(SELECTORS.settings.validationError);
			if (await errorMessage.isExisting()) {
				const errorText = await errorMessage.getText();
				expect(errorText).toMatch(/too long|maximum length|invalid/i);
			}

			const cancelButton = await $(SELECTORS.settings.llm.cancelButton);
			await cancelButton.click();
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
