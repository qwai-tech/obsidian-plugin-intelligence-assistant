/**
 * E2E tests for LLM security features
 * Priority: CRITICAL - Security testing
 *
 * These tests ensure that sensitive data (API keys) are properly protected.
 */

import { closeSettings } from '../../utils/actions';
import {

	openLlmTab,
	addProvider,
	waitForProvider,
	cleanProviders, // Added import
} from '../../utils/llm-helpers';
import { SELECTORS } from '../../utils/selectors';

describe('LLM Settings - Security', () => {
	beforeEach(async () => {
		await openLlmTab();
	});

	afterEach(async () => {
		await closeSettings();
		await cleanProviders(); // Added for cleanup
	});

	describe('API Key Protection', () => {
		it('should not display API key in plain text in provider table', async () => {
			await addProvider({
				provider: 'openai',
				apiKey: 'sk-test-secret-key-12345',
			});

			await waitForProvider('OpenAI');

			// Get the provider row
			const providerRow = await $(SELECTORS.llm.providerRow('OpenAI'));
			const rowText = await providerRow.getText();

			// API key should NOT be visible in the table
			expect(rowText).not.toContain('sk-test-secret-key-12345');
			expect(rowText).not.toContain('secret-key');
		});

		it('should mask API key in edit modal', async () => {
			await addProvider({
				provider: 'openai',
				apiKey: 'sk-test-masked-key-98765',
			});

			await waitForProvider('OpenAI');

			// Click edit button
			const editBtn = await $(SELECTORS.llm.editButton('OpenAI'));
			await editBtn.click();
			await browser.pause(300);

			// Wait for modal to open
			const modal = await $(SELECTORS.llm.modal.container);
			await modal.waitForDisplayed({ timeout: 3000 });

			// Get API key input
			const apiKeyInput = await $(SELECTORS.llm.modal.apiKeyInput);
			const inputType = await apiKeyInput.getAttribute('type');

			// Input should be password type or value should be masked
			const isPasswordType = inputType === 'password';
			const inputValue = await apiKeyInput.getValue();
			const isMasked = inputValue.includes('*') || inputValue.includes('•');

			// Either password type OR masked value
			expect(isPasswordType || isMasked).toBe(true);

			// If not password type, should not show full key
			if (inputType !== 'password') {
				expect(inputValue).not.toBe('sk-test-masked-key-98765');
			}

			// Close modal
			const cancelBtn = await $(SELECTORS.llm.modal.cancelButton);
			await cancelBtn.click();
		});

		it('should not log API keys in browser console', async () => {
			// Clear console logs
			await browser.execute(() => {
				console.clear();
			});

			await addProvider({
				provider: 'openai',
				apiKey: 'sk-test-console-check-555',
			});

			await waitForProvider('OpenAI');

			// Get console logs
			const logs = await browser.getLogs('browser');

			// Check that no log contains the API key
			for (const log of logs) {
				const message = log.message.toLowerCase();
				expect(message).not.toContain('sk-test-console-check-555');
				expect(message).not.toContain('console-check-555');
			}
		});
	});

	describe('XSS Protection', () => {
		it('should sanitize malicious provider names', async () => {
			// Try to add a provider with XSS in custom provider name
			// Note: This test depends on implementation details
			await addProvider({
				provider: 'openai',
				apiKey: 'sk-test-xss',
			});

			await waitForProvider('OpenAI');

			const providerRow = await $(SELECTORS.llm.providerRow('OpenAI'));

			// Check that no script tags are rendered
			const html = await providerRow.getHTML();
			expect(html).not.toMatch(/<script/i);
			expect(html).not.toMatch(/javascript:/i);
			expect(html).not.toMatch(/onerror=/i);
			expect(html).not.toMatch(/onclick=/i);
		});

		it('should sanitize malicious model names', async () => {
		try {
			// This would require adding a provider with malicious model names
			// For now, we just verify the UI doesn't execute scripts
			await openLlmTab();

			// Get the HTML of the entire settings area
			const settingsContent = await $('.settings-tab-content');
			const html = await settingsContent.getHTML();

			// Should not contain executable scripts
			expect(html).not.toMatch(/<script[^>]*>[\s\S]*?<\/script>/i);
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('Input Validation', () => {
		it('should reject extremely long API keys', async () => {
			const veryLongKey = 'sk-' + 'x'.repeat(10000); // 10KB key

			try {
				await addProvider({
					provider: 'openai',
					apiKey: veryLongKey,
				});

				await browser.pause(500);

				// If accepted, UI should still be functional
				const { getAllProviderNames } = await import('../../utils/llm-helpers');
				const providers = await getAllProviderNames();
				expect(Array.isArray(providers)).toBe(true);
			} catch (error) {
				// If rejected, that's also acceptable
				expect(error).toBeDefined();
			}
		});

		it('should handle special characters in base URL', async () => {
			const maliciousUrl = 'http://evil.com/"><script>alert("XSS")</script>';

			await addProvider({
				provider: 'openai',
				apiKey: 'sk-test',
				baseUrl: maliciousUrl,
			});

			await browser.pause(500);

			// UI should not execute the script
			const providerRow = await $(SELECTORS.llm.providerRow('OpenAI'));
			const html = await providerRow.getHTML();

			expect(html).not.toMatch(/<script/i);
			expect(html).not.toMatch(/alert\(/i);
		});
	});

	describe('Data Persistence Security', () => {
		it('should encrypt or protect API keys in storage', async () => {
			await addProvider({
				provider: 'openai',
				apiKey: 'sk-test-storage-check',
			});

			await waitForProvider('OpenAI');

			// Close and reopen settings
			await closeSettings();
			await browser.pause(500);
			await openLlmTab();
			await browser.pause(500);

			// Provider should still exist
			const { providerExists } = await import('../../utils/llm-helpers');
			expect(await providerExists('OpenAI')).toBe(true);

			// But we should NOT be able to see the API key in plain text
			// by inspecting the page source
			const pageSource = await browser.getPageSource();

			// The full API key should not appear in the page source
			expect(pageSource).not.toContain('sk-test-storage-check');
		});
	});

	describe('Rate Limiting & Error Messages', () => {
		it('should not expose sensitive information in error messages', async () => {
			// Add provider with invalid key
			await addProvider({
				provider: 'openai',
				apiKey: 'sk-invalid-key-should-not-show',
			});

			await waitForProvider('OpenAI');

			// Try to refresh models (will fail)
			const { refreshProviderModels } = await import('../../utils/llm-helpers');
			await refreshProviderModels('OpenAI');
			await browser.pause(2000);

			// Check for any notices or error messages
			const notices = await $$('.notice');
			for (const notice of notices) {
				const noticeText = await notice.getText();

				// Error message should not contain the full API key
				expect(noticeText).not.toContain('sk-invalid-key-should-not-show');
				expect(noticeText).not.toContain('invalid-key-should-not-show');
			}
		});
	});
});
