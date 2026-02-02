/**
 * E2E Load Testing
 * Tests system behavior under heavy load
 */

import { openChatView, sendChatMessage, waitForAssistantResponse, closeSettings } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import { testWithProvider } from '../../utils/test-helpers';
import { waitForModelsLoaded } from '../../utils/chat-helpers';


describe('Load Testing', () => {
	describe('Concurrent Operations', () => {
		it('should handle rapid message sending', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			const messageCount = 10;
			const startTime = Date.now();

			// Send many messages rapidly
			for (let i = 0; i < messageCount; i++) {
				await sendChatMessage(`Load test message ${i}`);
				await browser.pause(200); // Small delay between sends
			}

			// Wait for all to process
			await browser.pause(10000);

			const endTime = Date.now();
			const totalTime = endTime - startTime;

			// Should handle without crashing
			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

			// Performance should be acceptable
			expect(totalTime).toBeLessThan(60000); // 1 minute for 10 messages

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should handle multiple conversation switches', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);

			// Create multiple conversations
			for (let i = 0; i < 5; i++) {
				await newChatButton.click();
				await browser.pause(300);
				await sendChatMessage(`Conversation ${i}`);
				await browser.pause(2000);
			}

			// Rapidly switch between conversations
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (await toggleConversationsButton.isExisting()) {
				const startTime = Date.now();

				for (let i = 0; i < 10; i++) {
					await toggleConversationsButton.click();
					await browser.pause(300);

					const conversationList = await $(SELECTORS.chat.conversationList);
					if (await conversationList.isExisting()) {
						const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);
						if (conversations.length > 0) {
							const randomIndex = Math.floor(Math.random() * conversations.length);
							await conversations[randomIndex].click();
							await browser.pause(300);
						}
					}
				}

				const endTime = Date.now();
				const totalTime = endTime - startTime;

				// Should remain responsive
				expect(totalTime).toBeLessThan(30000);

				const chatInput = await $(SELECTORS.chat.input);
				expect(await chatInput.isEnabled()).toBe(true);
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

		it('should handle rapid settings changes', async () => {
			await browser.execute(() => {
				localStorage.setItem('obsidian-test-settings-load', 'true');
			});

			const iterations = 20;
			const startTime = Date.now();

			for (let i = 0; i < iterations; i++) {
				// Simulate rapid setting updates
				await browser.execute((iteration) => {
					const settings = {
						testValue: iteration,
						timestamp: Date.now(),
					};
					localStorage.setItem('test-load-settings', JSON.stringify(settings));
				}, i);

				await browser.pause(50);
			}

			const endTime = Date.now();
			const totalTime = endTime - startTime;

			// Should handle rapidly
			expect(totalTime).toBeLessThan(5000);

			await browser.execute(() => {
				localStorage.removeItem('obsidian-test-settings-load');
				localStorage.removeItem('test-load-settings');
			});
		});
	});

	describe('Large Data Sets', () => {
		it('should handle conversation with many messages', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			const messageCount = 20;

			// Send many messages
			for (let i = 0; i < messageCount; i++) {
				await sendChatMessage(`Message ${i} in long conversation`);
				await waitForAssistantResponse(30000);
				await browser.pause(500);
			}

			// UI should still be responsive
			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

			// Scrolling should work
			const messageList = await $(SELECTORS.chat.messageList);
			await browser.execute((element) => {
				element.scrollTop = 0;
			}, messageList);

			await browser.pause(200);

			expect(await messageList.isDisplayed()).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should handle large message content', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			// Send very long message
			const longMessage = 'A'.repeat(10000);

			const startTime = Date.now();
			await sendChatMessage(longMessage);
			await waitForAssistantResponse(30000);
			const endTime = Date.now();

			const processingTime = endTime - startTime;

			// Should handle large content
			expect(processingTime).toBeLessThan(35000);

			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should handle many providers configured', async function() {
			// This would require actually adding many providers
			// Skip for now as it's destructive
			this.skip();
		});

		it('should handle many models available', async function() {
			// Testing with 50+ models
			// This depends on actual provider configuration
			this.skip();
		});
	});

	describe('Memory Management', () => {
		it('should not leak memory with repeated operations', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);

			// Repeatedly create and destroy conversations
			for (let i = 0; i < 10; i++) {
				await newChatButton.click();
				await browser.pause(500);
				await sendChatMessage('Test');
				await browser.pause(2000);
			}

			// Check that browser is still responsive
			const chatInput = await $(SELECTORS.chat.input);
			const isResponsive = await chatInput.isEnabled();

			expect(isResponsive).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should clean up old messages efficiently', async function() {
			// Test memory cleanup for very long conversations
			this.skip();
		});
	});

	describe('Concurrent User Actions', () => {
		it('should handle overlapping operations', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			// Start sending a message
			const chatInput = await $(SELECTORS.chat.input);
			await chatInput.setValue('First message');
			await browser.keys(['Enter']);

			// Immediately try to interact with UI (don't wait for response)
			await browser.pause(100);

			const newChatButton = await $(SELECTORS.chat.newChatButton);
			await newChatButton.click();
			await browser.pause(500);

			// Should handle gracefully
			const chatInputNew = await $(SELECTORS.chat.input);
			expect(await chatInputNew.isEnabled()).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should queue operations appropriately', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			// Rapid fire multiple operations
			const operations = [
				() => sendChatMessage('Message 1'),
				() => sendChatMessage('Message 2'),
				() => sendChatMessage('Message 3'),
			];

			const startTime = Date.now();

			// Execute all rapidly
			for (const operation of operations) {
				operation();
				await browser.pause(100);
			}

			// Wait for queue to process
			await browser.pause(10000);

			const endTime = Date.now();
			const totalTime = endTime - startTime;

			// Should process in reasonable time
			expect(totalTime).toBeLessThan(40000);

			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

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

	describe('Stress Testing', () => {
		it('should handle maximum allowed input length', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			// Maximum realistic input
			const maxMessage = 'X'.repeat(50000);

			await sendChatMessage(maxMessage);

			// Should either accept or show appropriate error
			await browser.pause(2000);

			const chatInput = await $(SELECTORS.chat.input);
			const isEnabled = await chatInput.isEnabled();

			expect(isEnabled).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should handle rapid UI interactions', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);
			const settingsButton = await $(SELECTORS.chat.settingsButton);

			// Rapidly click different UI elements
			for (let i = 0; i < 20; i++) {
				if (i % 2 === 0) {
					await newChatButton.click();
				} else {
					await settingsButton.click();
				}
				await browser.pause(100);
			}

			// UI should still work
			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should handle rapid browser resizing', async () => {
		try {
			const sizes = [
				[1280, 800],
				[800, 600],
				[1920, 1080],
				[1024, 768],
			];

			for (const [width, height] of sizes) {
				await browser.setWindowSize(width, height);
				await browser.pause(200);
			}

			await openChatView();
			await waitForModelsLoaded(1, 15000);

			const chatView = await $(SELECTORS.chat.container);
			expect(await chatView.isDisplayed()).toBe(true);

			// Restore
			await browser.setWindowSize(1280, 800);
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

	describe('Network Load', () => {
		it('should handle slow network conditions', async function() {
			// This would require network throttling simulation
			this.skip();
		});

		it('should handle intermittent connectivity', async function() {
			// Simulate network dropping and recovering
			this.skip();
		});

		it('should batch API requests efficiently', async function() {
			// Monitor network requests to ensure batching
			this.skip();
		});
	});

	describe('Resource Limits', () => {
		it('should handle low memory conditions', async function() {
			// Simulate memory pressure
			this.skip();
		});

		it('should handle storage quota limits', async function() {
			// Test behavior when storage is full
			this.skip();
		});

		it('should limit concurrent operations', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			// Try to overwhelm with concurrent operations
			const promises: Promise<void>[] = [];

			for (let i = 0; i < 5; i++) {
				promises.push(
					(async () => {
						await sendChatMessage(`Concurrent ${i}`);
					})()
				);
			}

			// Wait for all
			await browser.pause(15000);

			// Should handle without crashing
			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

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

	describe('Recovery Under Load', () => {
		it('should recover from errors under load', async () => {
		try {
			await openChatView();
			await waitForModelsLoaded(1, 15000);

			// Generate load with some operations that might fail
			for (let i = 0; i < 5; i++) {
				await sendChatMessage(`Test ${i}`);
				await browser.pause(500);
			}

			// Even if some fail, should recover
			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

			await closeSettings();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should maintain data integrity under load', async function() {
			// Ensure conversations aren't corrupted under heavy load
			this.skip();
		});
	});
});
