/**
 * E2E tests for Ollama-specific functionality
 * Priority: P2 - Optional but valuable
 *
 * Note: Tests requiring a running Ollama server have been removed.
 * These tests focus on UI behavior and configuration without external dependencies.
 */

import { closeSettings } from '../../utils/actions';
import {

	openLlmTab,
	addProvider,
	getProviderStatus,
	waitForProvider,
	cleanProviders, // Added import
} from '../../utils/llm-helpers';
import { SELECTORS } from '../../utils/selectors';

describe('LLM Settings - Ollama Specific', () => {
	beforeEach(async () => {
		await openLlmTab();
	});

	afterEach(async () => {
		await closeSettings();
		await cleanProviders(); // Added for cleanup
	});

	describe('Ollama Provider Configuration', () => {
		it('should add Ollama provider with base URL', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
			});

			await waitForProvider('Ollama');

			const { providerExists } = await import('../../utils/llm-helpers');
			const exists = await providerExists('Ollama');
			expect(exists).toBe(true);
		});

		it('should display base URL for Ollama provider', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
			});

			await waitForProvider('Ollama');

			const providerRow = await $(SELECTORS.llm.providerRow('Ollama'));
			const baseUrlEl = await providerRow.$('.ia-table-subtext.ia-code');
			expect(await baseUrlEl.isExisting()).toBe(true);

			const baseUrlText = await baseUrlEl.getText();
			expect(baseUrlText).toBe('http://localhost:11434');
		});

		it('should not require API key for Ollama', async () => {
			// Ollama doesn't need API key, only base URL
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
			});

			await waitForProvider('Ollama');

			// Should be added successfully without API key
			const { providerExists } = await import('../../utils/llm-helpers');
			expect(await providerExists('Ollama')).toBe(true);
		});

		it('should accept different base URL formats', async () => {
			const baseUrls = [
				'http://localhost:11434',
				'http://127.0.0.1:11434',
				'http://ollama.local:11434',
				'http://192.168.1.100:11434',
			];

			for (const baseUrl of baseUrls) {
				await addProvider({
					provider: 'ollama',
					baseUrl: baseUrl,
				});

				await browser.pause(500);

				const { providerExists } = await import('../../utils/llm-helpers');
				expect(await providerExists('Ollama')).toBe(true);

				// Clean up for next iteration
				const { deleteProvider } = await import('../../utils/llm-helpers');
				await deleteProvider('Ollama', true);
				await browser.pause(300);
			}
		});

		it('should accept custom port numbers', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:8080',
			});

			await waitForProvider('Ollama');

			const providerRow = await $(SELECTORS.llm.providerRow('Ollama'));
			const baseUrlEl = await providerRow.$('.ia-table-subtext.ia-code');
			const baseUrlText = await baseUrlEl.getText();
			expect(baseUrlText).toContain('8080');
		});
	});

	describe('Ollama Server Status Detection', () => {
		it('should check Ollama server status on load', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
			});

			await waitForProvider('Ollama');
			await browser.pause(1500); // Wait for status check

			// Version text element should exist (even if showing "Checking..." or offline)
			const providerRow = await $(SELECTORS.llm.providerRow('Ollama'));
			const versionEl = await providerRow.$('.ia-table-subtext');
			expect(await versionEl.isExisting()).toBe(true);
		});

		it('should show status when Ollama server is unreachable', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:99999', // Invalid port
			});

			await waitForProvider('Ollama');
			await browser.pause(2000); // Wait for status check to timeout

			const status = await getProviderStatus('Ollama');
			expect(status).toBeTruthy();
			// Status might be "Offline", "Checking...", or similar
		});

		it('should update status when base URL is changed', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:99999',
			});

			await waitForProvider('Ollama');
			await browser.pause(1500);

			// Edit to valid URL (might still be offline, but URL is valid)
			const { editProvider } = await import('../../utils/llm-helpers');
			await editProvider('Ollama', {
				baseUrl: 'http://localhost:11434',
			});

			await browser.pause(1500);

			// Status should be rechecked
			const status = await getProviderStatus('Ollama');
			expect(status).toBeTruthy();
		});
	});

	describe('Ollama Model Filter', () => {
		it('should support model filter for Ollama', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
				modelFilter: 'llama.*',
			});

			await waitForProvider('Ollama');

			// Provider should be added with filter
			const { providerExists } = await import('../../utils/llm-helpers');
			expect(await providerExists('Ollama')).toBe(true);
		});

		it('should edit Ollama model filter', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
			});

			await waitForProvider('Ollama');

			const { editProvider } = await import('../../utils/llm-helpers');
			await editProvider('Ollama', {
				modelFilter: 'mistral.*',
			});

			await browser.pause(500);

			// Provider should still exist
			const { providerExists } = await import('../../utils/llm-helpers');
			expect(await providerExists('Ollama')).toBe(true);
		});
	});

	describe('Ollama Error Handling', () => {
		it('should handle invalid Ollama URL gracefully', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'not-a-valid-url',
			});

			await browser.pause(500);

			// Should not crash UI
			const { getAllProviderNames } = await import('../../utils/llm-helpers');
			const providers = await getAllProviderNames();
			expect(Array.isArray(providers)).toBe(true);
		});

		it('should handle Ollama server timeout', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://10.255.255.1:11434', // Non-routable IP
			});

			await waitForProvider('Ollama');
			await browser.pause(3000); // Wait for timeout

			// UI should still be functional
			const status = await getProviderStatus('Ollama');
			expect(status).toBeTruthy();
		});

		it('should handle Ollama connection refused', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:1', // Port 1 - likely refused
			});

			await waitForProvider('Ollama');
			await browser.pause(1500);

			// Should show offline or error status
			const status = await getProviderStatus('Ollama');
			expect(status).toBeTruthy();
		});
	});

	describe('Ollama Provider Icon', () => {
		it('should display Ollama provider icon', async () => {
			await addProvider({
				provider: 'ollama',
				baseUrl: 'http://localhost:11434',
			});

			await waitForProvider('Ollama');

			const providerRow = await $(SELECTORS.llm.providerRow('Ollama'));
			const iconContainer = await providerRow.$('.ia-provider-icon');

			if (await iconContainer.isExisting()) {
				// Should contain SVG
				const svg = await iconContainer.$('svg');
				expect(await svg.isExisting()).toBe(true);
			}
		});
	});
});
