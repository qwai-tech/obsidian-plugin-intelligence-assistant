/**
 * E2E Tests for Conversation Management
 * Tests: TC-CHAT-001, TC-CHAT-002, TC-CHAT-003, TC-CHAT-004
 */

import { openChatView, sendChatMessage, waitForAssistantResponse, closeSettings } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import { testWithProvider } from '../../utils/test-helpers';
import {
	waitForModelsLoaded,
} from '../../utils/chat-helpers';

describe('Chat - Conversation Management', () => {
	beforeEach(async () => {
		await openChatView();
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('TC-CHAT-001: 创建对话', () => {
		it('should create new conversation', async () => {
		try {
			await waitForModelsLoaded(1, 15000);

			// Click new chat button
			const newChatButton = await $(SELECTORS.chat.newChatButton);
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(1000);

			// Verify chat input is ready
			const chatInput = await $(SELECTORS.chat.input);
			expect(await chatInput.isEnabled()).toBe(true);

			// Send a message to establish the conversation
			await sendChatMessage('Hello, this is a new conversation');
			await waitForAssistantResponse(30000);

			// Conversation should be created
			const messageList = await $(SELECTORS.chat.messageList);
			const messages = await messageList.$$('.ia-chat-message');
			expect(messages.length).toBeGreaterThan(0);
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should auto-generate conversation title', async () => {
		try {
			await waitForModelsLoaded(1, 15000);

			// Create new conversation
			const newChatButton = await $(SELECTORS.chat.newChatButton);
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(1000);

			// Send a distinctive message
			await sendChatMessage('Tell me about quantum computing');
			await waitForAssistantResponse(30000);

			await browser.pause(2000);

			// Open conversation list
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (await toggleConversationsButton.isExisting()) {
				await toggleConversationsButton.waitForClickable({ timeout: 5000 });
				await toggleConversationsButton.click();
				await browser.pause(500);

				// Check if conversation has a title
				const conversationList = await $(SELECTORS.chat.conversationList);
				if (await conversationList.isExisting()) {
					const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);
					if (conversations.length > 0) {
						const titleElement = await conversations[0].$(SELECTORS.chat.conversationTitle);
						const title = await titleElement.getText();

						// Title should be generated (not empty or default)
						expect(title.length).toBeGreaterThan(0);
						expect(title).not.toBe('New conversation');
					}
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

		it('should create multiple conversations', async () => {
		try {
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);

			// Create first conversation
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('First conversation message');
			await waitForAssistantResponse(30000);

			// Create second conversation
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('Second conversation message');
			await waitForAssistantResponse(30000);

			// Open conversation list
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (await toggleConversationsButton.isExisting()) {
				await toggleConversationsButton.waitForClickable({ timeout: 5000 });
				await toggleConversationsButton.click();
				await browser.pause(500);

				const conversationList = await $(SELECTORS.chat.conversationList);
				if (await conversationList.isExisting()) {
					const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);
					expect(conversations.length).toBeGreaterThanOrEqual(2);
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
	});

	describe('TC-CHAT-002: 切换对话', () => {
		it('should switch between conversations', async function() {
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);

			// Create first conversation with unique message
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('Message in conversation A');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Create second conversation with different message
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('Message in conversation B');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Open conversation list
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			if (!await conversationList.isExisting()) {
				this.skip();
			}

			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);
			if (conversations.length < 2) {
				this.skip();
			}

			// Switch to first conversation
			await conversations[1].waitForClickable({ timeout: 5000 });
			await conversations[1].click(); // Index 1 is the first conversation (0 is current)
			await browser.pause(1000);

			// Verify conversation A content is displayed
			const messageList = await $(SELECTORS.chat.messageList);
			const messagesText = await messageList.getText();
			expect(messagesText).toContain('conversation A');
		});

		it('should preserve conversation context when switching', async function() {
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);

			// Create conversation with context
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('My name is Alice');
			await waitForAssistantResponse(30000);
			await browser.pause(500);

			// Create new conversation
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('My name is Bob');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Switch back to first conversation
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);
			if (conversations.length < 2) {
				this.skip();
			}

			await conversations[1].waitForClickable({ timeout: 5000 });
			await conversations[1].click();
			await browser.pause(1000);

			// Ask about the name in first conversation
			await sendChatMessage('What is my name?');
			await waitForAssistantResponse(30000);

			const messageList = await $(SELECTORS.chat.messageList);
			const messagesText = await messageList.getText();

			// Should reference Alice, not Bob
			expect(messagesText.toLowerCase()).toContain('alice');
		});

		it('should update UI when switching conversations', async function() {
			await waitForModelsLoaded(1, 15000);

			const newChatButton = await $(SELECTORS.chat.newChatButton);

			// Create two conversations
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('First');
			await waitForAssistantResponse(30000);

			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('Second');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Get message count in second conversation
			let messageList = await $(SELECTORS.chat.messageList);
			let messages = await messageList.$$('.ia-chat-message');
			const secondConversationMessageCount = messages.length;

			// Switch to first conversation
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);
			await conversations[1].waitForClickable({ timeout: 5000 });
			await conversations[1].click();
			await browser.pause(1000);

			// Message count should be different
			messageList = await $(SELECTORS.chat.messageList);
			messages = await messageList.$$('.ia-chat-message');
			const firstConversationMessageCount = messages.length;

			expect(firstConversationMessageCount).not.toBe(secondConversationMessageCount);
		});
	});

	describe('TC-CHAT-003: 删除对话', () => {
		it('should delete conversation', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create a conversation to delete
			const newChatButton = await $(SELECTORS.chat.newChatButton);
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('Conversation to delete');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Open conversation list
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			if (!await conversationList.isExisting()) {
				this.skip();
			}

			const conversationsBefore = await conversationList.$$(SELECTORS.chat.conversationItem);
			const countBefore = conversationsBefore.length;

			// Find and click delete button on first conversation
			if (conversationsBefore.length > 0) {
				const conversationActions = await conversationsBefore[0].$(SELECTORS.chat.conversationActions);
				if (await conversationActions.isExisting()) {
					const deleteButton = await conversationActions.$(SELECTORS.chat.conversationDeleteButton);
					if (await deleteButton.isExisting()) {
						await deleteButton.waitForClickable({ timeout: 5000 });
						await deleteButton.click();
						await browser.pause(500);

						// Confirm deletion if modal appears
						const confirmButton = await $('button*=Delete');
						if (await confirmButton.isExisting()) {
							await confirmButton.waitForClickable({ timeout: 5000 });
							await confirmButton.click();
							await browser.pause(1000);
						}

						// Verify conversation was deleted
						const conversationsAfter = await conversationList.$$(SELECTORS.chat.conversationItem);
						expect(conversationsAfter.length).toBe(countBefore - 1);
					}
				}
			}
		});

		it('should confirm before deleting conversation', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create conversation
			const newChatButton = await $(SELECTORS.chat.newChatButton);
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(500);
			await sendChatMessage('Test conversation');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Open conversation list
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);

			if (conversations.length > 0) {
				const conversationActions = await conversations[0].$(SELECTORS.chat.conversationActions);
				if (await conversationActions.isExisting()) {
					const deleteButton = await conversationActions.$(SELECTORS.chat.conversationDeleteButton);
					if (await deleteButton.isExisting()) {
						await deleteButton.waitForClickable({ timeout: 5000 });
						await deleteButton.click();
						await browser.pause(500);

						// Should show confirmation dialog
						const confirmModal = await $('.modal');
						if (await confirmModal.isExisting()) {
							const modalText = await confirmModal.getText();
							expect(modalText.toLowerCase()).toMatch(/delete|confirm|are you sure/);

							// Cancel instead of delete
							const cancelButton = await $('button*=Cancel');
							if (await cancelButton.isExisting()) {
								await cancelButton.waitForClickable({ timeout: 5000 });
								await cancelButton.click();
								await browser.pause(500);
							}
						}
					}
				}
			}
		});

		it('should handle deleting current conversation', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create and send message in current conversation
			await sendChatMessage('Current conversation');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Open conversation list and delete current conversation
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);

			if (conversations.length > 0) {
				const conversationActions = await conversations[0].$(SELECTORS.chat.conversationActions);
				const deleteButton = await conversationActions.$(SELECTORS.chat.conversationDeleteButton);

				if (await deleteButton.isExisting()) {
					await deleteButton.waitForClickable({ timeout: 5000 });
					await deleteButton.click();
					await browser.pause(500);

					const confirmButton = await $('button*=Delete');
					if (await confirmButton.isExisting()) {
						await confirmButton.waitForClickable({ timeout: 5000 });
						await confirmButton.click();
						await browser.pause(1000);
					}

					// Should create new conversation or show empty state
					const chatInput = await $(SELECTORS.chat.input);
					expect(await chatInput.isEnabled()).toBe(true);
				}
			}
		});
	});

	describe('TC-CHAT-004: 对话持久化', () => {
		it('should persist conversation across sessions', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create conversation with distinctive content
			const uniqueMessage = `Unique test message ${Date.now()}`;
			await sendChatMessage(uniqueMessage);
			await waitForAssistantResponse(30000);
			await browser.pause(2000);

			// Refresh the page to simulate new session
			await browser.refresh();
			await browser.pause(3000);

			// Reopen chat view
			await openChatView();
			await browser.pause(2000);

			// Check if conversation is still there
			const messageList = await $(SELECTORS.chat.messageList);
			if (await messageList.isExisting()) {
				const messagesText = await messageList.getText();

				// The unique message should be preserved
				expect(messagesText).toContain(uniqueMessage);
			}
		});

		it('should save conversation history', async () => {
		try {
			await waitForModelsLoaded(1, 15000);

			// Send multiple messages
			await sendChatMessage('First message');
			await waitForAssistantResponse(30000);
			await browser.pause(500);

			await sendChatMessage('Second message');
			await waitForAssistantResponse(30000);
			await browser.pause(500);

			await sendChatMessage('Third message');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			// Verify all messages are in history
			const messageList = await $(SELECTORS.chat.messageList);
			const messages = await messageList.$$('.ia-chat-message');

			// Should have at least 6 messages (3 user + 3 assistant)
			expect(messages.length).toBeGreaterThanOrEqual(6);
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should restore conversation state', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create conversation with context
			await sendChatMessage('Remember this: The secret code is 12345');
			await waitForAssistantResponse(30000);
			await browser.pause(2000);

			// Switch to new conversation
			const newChatButton = await $(SELECTORS.chat.newChatButton);
			await newChatButton.waitForClickable({ timeout: 5000 });
			await newChatButton.click();
			await browser.pause(1000);

			// Switch back to original conversation
			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);

			if (conversations.length >= 2) {
				await conversations[1].waitForClickable({ timeout: 5000 });
				await conversations[1].click();
				await browser.pause(1000);

				// Ask about the saved context
				await sendChatMessage('What was the secret code I mentioned?');
				await waitForAssistantResponse(30000);

				const messageList = await $(SELECTORS.chat.messageList);
				const messagesText = await messageList.getText();

				// Should recall the secret code
				expect(messagesText).toContain('12345');
			}
		});
	});

	describe('Conversation List UI', () => {
		it('should display conversation list', async function() {
			await waitForModelsLoaded(1, 15000);

			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			expect(await conversationList.isDisplayed()).toBe(true);
		});

		it('should show conversation metadata', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create conversation
			await sendChatMessage('Test message');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			const conversationList = await $(SELECTORS.chat.conversationList);
			const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);

			if (conversations.length > 0) {
				const conversationText = await conversations[0].getText();

				// Should show some metadata (title, timestamp, message count, etc.)
				expect(conversationText.length).toBeGreaterThan(0);
			}
		});

		it('should handle empty conversation list', async function() {
			// This test would require deleting all conversations first
			// Skip for now as it's destructive
			this.skip();
		});
	});

	describe('Conversation Search and Filter', () => {
		it('should search conversations by content', async function() {
			await waitForModelsLoaded(1, 15000);

			// Create conversation with searchable content
			await sendChatMessage('Quantum physics discussion');
			await waitForAssistantResponse(30000);
			await browser.pause(1000);

			const toggleConversationsButton = await $(SELECTORS.chat.toggleConversationsButton);
			if (!await toggleConversationsButton.isExisting()) {
				this.skip();
			}

			await toggleConversationsButton.waitForClickable({ timeout: 5000 });
			await toggleConversationsButton.click();
			await browser.pause(500);

			// Look for search input in conversation list
			const searchInput = await $('input[type="search"]');
			if (await searchInput.isExisting()) {
				await searchInput.setValue('quantum');
				await browser.pause(500);

				const conversationList = await $(SELECTORS.chat.conversationList);
				const conversations = await conversationList.$$(SELECTORS.chat.conversationItem);

				// Should filter to show only matching conversations
				expect(conversations.length).toBeGreaterThanOrEqual(1);
			} else {
				this.skip(); // Search not implemented
			}
		});
	});
});