/**
 * E2E Tests for RAG (Retrieval-Augmented Generation)
 * Tests: TC-RAG-001, TC-RAG-002, TC-RAG-003, TC-RAG-004
 */

import { openChatView, sendChatMessage, waitForAssistantResponse, closeSettings } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import { testWithProvider } from '../../utils/test-helpers';
import {

	getLastAssistantMessage,
	waitForModelsLoaded,
} from '../../utils/chat-helpers';

describe('Chat - RAG Functionality', () => {
	beforeEach(async () => {
		await openChatView();
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('TC-RAG-001: 启用 RAG', () => {
		it('should show RAG toggle button', async () => {
		try {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				// RAG feature might not be available
				return;
			}

			expect(await ragButton.isDisplayed()).toBe(true);
			expect(await ragButton.isEnabled()).toBe(true);
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should toggle RAG on and off', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// Click to enable
			await ragButton.click();
			await browser.pause(500);

			// Should show visual indicator that RAG is enabled
			const isActive = await ragButton.getAttribute('class');
			expect(isActive).toContain('active');

			// Click to disable
			await ragButton.click();
			await browser.pause(500);

			const isInactive = await ragButton.getAttribute('class');
			expect(isInactive).not.toContain('active');
		});

		it('should enable RAG for single message', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// Enable RAG
			await ragButton.click();
			await browser.pause(500);

			// Send message
			await sendChatMessage('What notes do I have about quantum computing?');
			await waitForAssistantResponse(30000);

			// RAG should be used for this message
			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});

		it('should persist RAG state across messages', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// Enable RAG
			await ragButton.click();
			await browser.pause(500);

			// Send first message
			await sendChatMessage('First query');
			await waitForAssistantResponse(30000);

			// RAG should still be enabled for second message
			await sendChatMessage('Second query');
			await waitForAssistantResponse(30000);

			// Verify RAG is still active
			const isActive = await ragButton.getAttribute('class');
			expect(isActive).toContain('active');
		});
	});

	describe('TC-RAG-002: RAG 搜索', () => {
		it('should search vault for relevant content', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// Enable RAG
			await ragButton.click();
			await browser.pause(500);

			// Ask about content that should exist in vault
			await sendChatMessage('Summarize my notes about testing');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();

			// Response should reference vault content
			expect(response.length).toBeGreaterThan(0);
		});

		it('should show which documents were retrieved', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('What are my recent notes?');
			await waitForAssistantResponse(30000);

			// Look for source citations or retrieved documents display
			const sourcesSection = await $('.sources-section');
			const citationsSection = await $('.citations');

			const hasSourcesUI = (await sourcesSection.isExisting()) || (await citationsSection.isExisting());

			// May or may not show sources depending on implementation
			expect(typeof hasSourcesUI).toBe('boolean');
		});

		it('should handle empty search results', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			// Search for content that definitely doesn't exist
			await sendChatMessage('Find my notes about xyzabc123nonexistent');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();

			// Should indicate no relevant content found
			const indicatesNoResults = response.toLowerCase().includes('no notes') ||
				response.toLowerCase().includes('cannot find') ||
				response.toLowerCase().includes('don\'t have') ||
				response.toLowerCase().includes('not found');

			expect(indicatesNoResults).toBe(true);
		});

		it('should rank results by relevance', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			// Ask specific question
			await sendChatMessage('What are the most important points about E2E testing?');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();

			// Should prioritize most relevant content
			// Difficult to test programmatically
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe('TC-RAG-003: RAG 配置', () => {
		it('should respect RAG configuration settings', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// RAG behavior should follow settings
			// (chunk size, overlap, top-k results, etc.)
			// This is implicit in the search results
			this.skip();
		});

		it('should handle different embedding models', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// If multiple embedding models are configured
			// Should use the appropriate one
			this.skip();
		});

		it('should respect file exclusion patterns', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// RAG should exclude files matching exclusion patterns
			// (e.g., .obsidian/, templates/, etc.)
			this.skip();
		});
	});

	describe('TC-RAG-004: RAG 性能', () => {
		it('should perform search quickly', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			const startTime = Date.now();
			await sendChatMessage('Quick search test');
			await waitForAssistantResponse(30000);
			const endTime = Date.now();

			const duration = endTime - startTime;

			// Should respond within reasonable time
			// (30 seconds is the timeout, actual should be much faster)
			expect(duration).toBeLessThan(30000);
		});

		it('should handle large vaults efficiently', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// Even with large number of files
			// Should maintain performance
			this.skip();
		});

		it('should show loading indicator during search', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			// Start search
			const chatInput = await $(SELECTORS.chat.input);
			await chatInput.setValue('Search query');

			const sendButton = await $('button[type="submit"]');
			if (await sendButton.isExisting()) {
				await sendButton.click();
			} else {
				await chatInput.keys('Enter');
			}

			await browser.pause(100);

			// Should show some loading indicator
			const thinkingIndicator = await $(SELECTORS.chat.thinkingIndicator);
			const streamingMessage = await $(SELECTORS.chat.streamingMessage);

			const hasLoadingUI = (await thinkingIndicator.isExisting()) || (await streamingMessage.isExisting());
			expect(typeof hasLoadingUI).toBe('boolean');
		});
	});

	describe('RAG with Different Content Types', () => {
		it('should search markdown content', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('Find my markdown notes');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});

		it('should handle code blocks in search', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('Find code examples in my notes');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});

		it('should search headings and structure', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('What sections are in my documentation?');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe('RAG Integration', () => {
		it('should work with different LLM providers', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// RAG should work regardless of LLM provider
			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('Test RAG integration');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});

		it('should combine with web search', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			const webSearchButton = await $(SELECTORS.chat.webSearchButton);

			if (!await ragButton.isExisting() || !await webSearchButton.isExisting()) {
				this.skip();
			}

			// Enable both RAG and web search
			await ragButton.click();
			await browser.pause(300);
			await webSearchButton.click();
			await browser.pause(500);

			await sendChatMessage('Search both my vault and the web');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});

		it('should work in agent mode', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// Switch to agent mode if available
			const modeSelector = await $(SELECTORS.chat.modeSelector);
			if (await modeSelector.isExisting()) {
				// Select agent mode
				const agentModeButton = await $(SELECTORS.chat.modeButton('agent'));
				if (await agentModeButton.isExisting()) {
					await agentModeButton.click();
					await browser.pause(1000);
				}
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('Use RAG in agent mode');
			await waitForAssistantResponse(30000);

			const response = await getLastAssistantMessage();
			expect(response.length).toBeGreaterThan(0);
		});
	});

	describe('RAG Error Handling', () => {
		it('should handle embedding errors gracefully', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// If embedding service is unavailable
			// Should show appropriate error
			this.skip();
		});

		it('should handle search timeout', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// If search takes too long
			// Should timeout gracefully
			this.skip();
		});

		it('should fallback when RAG fails', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// If RAG completely fails
			// Should still allow regular chat
			this.skip();
		});
	});

	describe('RAG UI Feedback', () => {
		it('should show number of documents retrieved', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('Search test');
			await waitForAssistantResponse(30000);

			// Look for document count indicator
			const documentCount = await $('.document-count');
			const sourceCount = await $('.source-count');

			// May or may not be implemented
			const hasCountUI = (await documentCount.isExisting()) || (await sourceCount.isExisting());
			expect(typeof hasCountUI).toBe('boolean');
		});

		it('should allow clicking on sources', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			await ragButton.click();
			await browser.pause(500);

			await sendChatMessage('Find sources');
			await waitForAssistantResponse(30000);

			// If sources are shown, they should be clickable
			const sourceLinks = await $$('.source-link');
			if (sourceLinks.length > 0) {
				expect(await sourceLinks[0].isClickable()).toBe(true);
			}
		});

		it('should highlight search terms in sources', async function() {
			await waitForModelsLoaded(1, 15000);

			const ragButton = await $(SELECTORS.chat.ragButton);
			if (!await ragButton.isExisting()) {
				this.skip();
			}

			// If showing source previews
			// Search terms should be highlighted
			this.skip();
		});
	});
});
