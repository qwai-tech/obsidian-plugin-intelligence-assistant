/**
 * E2E Tests - Repair Verification
 * Verifies that recent core repairs (RAG, Security, Architecture) are working correctly.
 */

import { navigateToPluginSettings, openChatView, closeSettings, sendChatMessage, waitForAssistantResponse } from '../utils/actions';
import { SELECTORS } from '../utils/selectors';
import { getLastAssistantMessage, waitForStreamingComplete } from '../utils/chat-helpers';

describe('Intelligence Assistant - Repair Verification', () => {
	
	describe('Security & Stability (Tasks 1.1, 1.2)', () => {
		it('should display the security warning in LLM settings', async () => {
			await navigateToPluginSettings();
			
			// Navigate to LLM tab
			const llmTab = await $(SELECTORS.tabs.llm);
			await llmTab.click();
			await browser.pause(500);

			// Check for the security warning box
			const warningBox = await $('.ia-warning-box');
			expect(await warningBox.isDisplayed()).toBe(true);
			
			const warningTitle = await warningBox.$('span');
			expect(await warningTitle.getText()).toContain('Security Warning');
			
			await closeSettings();
		});
	});

	describe('Architecture Decoupling (Task 3.2)', () => {
		it('should still be able to chat after ChatService refactoring', async () => {
			await openChatView();
			
			const testMessage = 'Hello, are you working correctly?';
			await sendChatMessage(testMessage);
			
			// This verifies that ChatService.streamResponse is correctly wired
			await waitForAssistantResponse(15000);
			await waitForStreamingComplete();
			
			const lastMessage = await getLastAssistantMessage();
			expect(lastMessage).toBeTruthy();
			expect(lastMessage.length).toBeGreaterThan(0);
		});
	});

	describe('RAG Implementation (Task 2.1, 3.1)', () => {
		it('should load RAG settings and show index stats', async () => {
			await navigateToPluginSettings();
			
			// Navigate to RAG tab and wait for it to be active
			const ragTab = await $(SELECTORS.tabs.rag);
			await ragTab.waitForClickable();
			await ragTab.click();
			await browser.pause(1000); // Give time for view to switch

			// Verify index stats are displayed (this confirms VectorStore logic hasn't crashed UI)
			// RAG indexing might be asynchronous, so we wait longer
			const statsContainer = await $('.rag-index-stats');
			await statsContainer.waitForDisplayed({ 
				timeout: 10000, 
				timeoutMsg: 'RAG index stats did not appear within 10s' 
			});
			expect(await statsContainer.isDisplayed()).toBe(true);
			
			await closeSettings();
		});
	});
});
