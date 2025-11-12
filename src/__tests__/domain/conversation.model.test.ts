/**
 * Test suite for Conversation Model
 */

import { ConversationModel } from '../../domain/conversation/conversation.model';
import { createTestConversation } from '../../test-support/test-utils';
import type { Message } from '@/types';

describe('ConversationModel', () => {
	let conversation: ConversationModel;

	beforeEach(() => {
		conversation = new ConversationModel(createTestConversation());
	});

	describe('addMessage', () => {
		it('should add message to conversation', () => {
			const message: Message = {
				role: 'user',
				content: 'Hello'
			};

			conversation.addMessage(message);

			expect(conversation.getMessages()).toContain(message);
			expect(conversation.getMessages()).toHaveLength(1);
		});

		it('should add multiple messages', () => {
			const message1: Message = { role: 'user', content: 'Hello' };
			const message2: Message = { role: 'assistant', content: 'Hi there!' };

			conversation.addMessage(message1);
			conversation.addMessage(message2);

			expect(conversation.getMessages()).toHaveLength(2);
		});

		it('should update conversation timestamp', () => {
			const beforeTime = Date.now();
			const message: Message = { role: 'user', content: 'Test' };

			conversation.addMessage(message);

			expect(conversation.toJSON().updatedAt).toBeGreaterThanOrEqual(beforeTime);
		});
	});

	describe('removeLastMessage', () => {
		it('should remove and return last message', () => {
			const message1: Message = { role: 'user', content: 'First' };
			const message2: Message = { role: 'assistant', content: 'Second' };

			conversation.addMessage(message1);
			conversation.addMessage(message2);

			const removed = conversation.removeLastMessage();

			expect(removed).toEqual(message2);
			expect(conversation.getMessages()).toHaveLength(1);
		});

		it('should return undefined when no messages', () => {
			const removed = conversation.removeLastMessage();

			expect(removed).toBeUndefined();
		});
	});

	describe('getMessages', () => {
		it('should return all messages', () => {
			const message1: Message = { role: 'user', content: 'First' };
			const message2: Message = { role: 'assistant', content: 'Second' };

			conversation.addMessage(message1);
			conversation.addMessage(message2);

			const messages = conversation.getMessages();

			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual(message1);
			expect(messages[1]).toEqual(message2);
		});
	});

	describe('getTotalTokens', () => {
		it('should calculate total tokens from all messages', () => {
			const message1: Message = {
				role: 'user',
				content: 'Hello',
				tokenUsage: { totalTokens: 10 }
			};
			const message2: Message = {
				role: 'assistant',
				content: 'Hi',
				tokenUsage: { totalTokens: 15 }
			};

			conversation.addMessage(message1);
			conversation.addMessage(message2);

			expect(conversation.getTotalTokens()).toBe(25);
		});

		it('should return 0 when no token usage', () => {
			conversation.addMessage({ role: 'user', content: 'Hello' });

			expect(conversation.getTotalTokens()).toBe(0);
		});

		it('should handle partial token usage', () => {
			const message: Message = {
				role: 'user',
				content: 'Hello',
				tokenUsage: { promptTokens: 5, completionTokens: 10 }
			};

			conversation.addMessage(message);

			expect(conversation.getTotalTokens()).toBe(0); // Only totalTokens is counted
		});
	});

	describe('getSummary', () => {
		it('should return empty string for empty conversation', () => {
			expect(conversation.getSummary()).toBe('Empty conversation');
		});

		it('should return first user message as summary', () => {
			conversation.addMessage({ role: 'user', content: 'What is AI?' });
			conversation.addMessage({ role: 'assistant', content: 'AI is...' });

			expect(conversation.getSummary()).toBe('What is AI?');
		});

		it('should truncate long messages', () => {
			const longMessage = 'a'.repeat(200);
			conversation.addMessage({ role: 'user', content: longMessage });

			const summary = conversation.getSummary();

			expect(summary.length).toBeLessThanOrEqual(53); // 50 + '...'
			expect(summary.endsWith('...')).toBe(true);
		});
	});

	describe('validate', () => {
		it('should validate valid conversation', () => {
			const conv = new ConversationModel(
				createTestConversation({
					id: 'valid-id',
					title: 'Valid Title'
				})
			);

			const result = conv.validate();

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect missing required fields', () => {
			const conv = new ConversationModel(
				createTestConversation({
					id: '',
					title: ''
				})
			);

			const result = conv.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Conversation ID is required');
			expect(result.errors).toContain('Conversation title is required');
		});

		it('should detect invalid timestamps', () => {
			const conv = new ConversationModel(
				createTestConversation({
					createdAt: -1,
					updatedAt: -1
				})
			);

			const result = conv.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Invalid creation timestamp');
			expect(result.errors).toContain('Invalid update timestamp');
		});

		it('should detect when updatedAt is before createdAt', () => {
			const now = Date.now();
			const conv = new ConversationModel(
				createTestConversation({
					createdAt: now,
					updatedAt: now - 1000
				})
			);

			const result = conv.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Update timestamp cannot be before creation timestamp');
		});
	});

	describe('static create', () => {
		it('should create new conversation with defaults', () => {
			const conv = ConversationModel.create('New Chat', '💬');

			expect(conv).toBeInstanceOf(ConversationModel);
			expect(conv.toJSON().title).toBe('New Chat');
			expect(conv.toJSON().icon).toBe('💬');
			expect(conv.getMessages()).toHaveLength(0);
		});

		it('should generate unique IDs', () => {
			const conv1 = ConversationModel.create('Chat 1');
			const conv2 = ConversationModel.create('Chat 2');

			expect(conv1.toJSON().id).not.toBe(conv2.toJSON().id);
		});
	});

	describe('toJSON and fromJSON', () => {
		it('should serialize and deserialize', () => {
			conversation.addMessage({ role: 'user', content: 'Hello' });

			const json = conversation.toJSON();
			const restored = ConversationModel.fromJSON(json);

			expect(restored.getMessages()).toEqual(conversation.getMessages());
			expect(restored.toJSON()).toEqual(json);
		});
	});
});
