/**
 * ChatViewState Tests
 * Comprehensive test suite for event-driven state management
 */

import { ChatViewState } from '../chat-view-state';
import { Message, Attachment } from '@/types';
import { TFile, TFolder } from 'obsidian';

describe('ChatViewState', () => {
	let state: ChatViewState;

	beforeEach(() => {
		state = new ChatViewState();
	});

	afterEach(() => {
		// Clean up event listeners
		state.off('state-change', jest.fn());
	});

	describe('Message Management', () => {
		it('should initialize with empty messages', () => {
			expect(state.messages).toEqual([]);
		});

		it('should add messages', () => {
			const message: Message = {
				role: 'user',
				content: 'Hello, world!'
			};

			state.addMessage(message);

			expect(state.messages).toHaveLength(1);
			expect(state.messages[0]).toEqual(message);
		});

		it('should clear messages', () => {
			state.addMessage({ role: 'user', content: 'Test' });
			state.clearMessages();

			expect(state.messages).toEqual([]);
		});

		it('should emit event on message addition', (done) => {
			const message: Message = { role: 'user', content: 'Test' };

			state.on('state-change', (event: any) => {
				expect(event.field).toBe('messages');
				expect(event.newValue).toHaveLength(1);
				done();
			});

			state.addMessage(message);
		});

		it('should set messages array', () => {
			const messages: Message[] = [
				{ role: 'user', content: 'Message 1' },
				{ role: 'assistant', content: 'Message 2' }
			];

			state.messages = messages;

			expect(state.messages).toEqual(messages);
		});
	});

	describe('Conversation Management', () => {
		it('should initialize with null conversation ID', () => {
			expect(state.currentConversationId).toBeNull();
		});

		it('should set conversation ID', () => {
			state.currentConversationId = 'conv-123';

			expect(state.currentConversationId).toBe('conv-123');
		});

		it('should emit event on conversation ID change', (done) => {
			state.on('state-change', (event: any) => {
				expect(event.field).toBe('currentConversationId');
				expect(event.newValue).toBe('conv-123');
				done();
			});

			state.currentConversationId = 'conv-123';
		});
	});

	describe('Configuration State', () => {
		it('should initialize with default temperature', () => {
			expect(state.temperature).toBe(0.7);
		});

		it('should set temperature', () => {
			state.temperature = 0.9;

			expect(state.temperature).toBe(0.9);
		});

		it('should initialize with default max tokens', () => {
			expect(state.maxTokens).toBe(4000);
		});

		it('should set max tokens', () => {
			state.maxTokens = 2000;

			expect(state.maxTokens).toBe(2000);
		});

		it('should initialize with chat mode', () => {
			expect(state.mode).toBe('chat');
		});

		it('should switch to agent mode', () => {
			state.mode = 'agent';

			expect(state.mode).toBe('agent');
		});
	});

	describe('Feature Flags', () => {
		it('should initialize with RAG disabled', () => {
			expect(state.enableRAG).toBe(false);
		});

		it('should enable RAG', () => {
			state.enableRAG = true;

			expect(state.enableRAG).toBe(true);
		});

		it('should initialize with web search disabled', () => {
			expect(state.enableWebSearch).toBe(false);
		});

		it('should enable web search', () => {
			state.enableWebSearch = true;

			expect(state.enableWebSearch).toBe(true);
		});
	});

	describe('UI State', () => {
		it('should initialize with conversation list hidden', () => {
			expect(state.conversationListVisible).toBe(false);
		});

		it('should show conversation list', () => {
			state.conversationListVisible = true;

			expect(state.conversationListVisible).toBe(true);
		});

		it('should initialize with conversation list unpinned', () => {
			expect(state.conversationListPinned).toBe(false);
		});

		it('should pin conversation list', () => {
			state.conversationListPinned = true;

			expect(state.conversationListPinned).toBe(true);
		});
	});

	describe('Attachment Management', () => {
		it('should initialize with no attachments', () => {
			expect(state.currentAttachments).toEqual([]);
		});

		it('should add attachment', () => {
			const attachment: Attachment = {
				type: 'file',
				name: 'test.md',
				path: '/test.md',
				content: 'Test content'
			};

			state.addAttachment(attachment);

			expect(state.currentAttachments).toHaveLength(1);
			expect(state.currentAttachments[0]).toEqual(attachment);
		});

		it('should remove attachment by index', () => {
			const att1: Attachment = { type: 'file', name: 'file1.md', path: '/file1.md', content: 'Content 1' };
			const att2: Attachment = { type: 'file', name: 'file2.md', path: '/file2.md', content: 'Content 2' };

			state.addAttachment(att1);
			state.addAttachment(att2);
			state.removeAttachment(0);

			expect(state.currentAttachments).toHaveLength(1);
			expect(state.currentAttachments[0]).toEqual(att2);
		});

		it('should clear all attachments', () => {
			state.addAttachment({ type: 'file', name: 'test.md', path: '/test.md', content: 'Test' });
			state.clearAttachments();

			expect(state.currentAttachments).toEqual([]);
		});

		it('should emit event on attachment addition', (done) => {
			const attachment: Attachment = { type: 'file', name: 'test.md', path: '/test.md', content: 'Test' };

			state.on('state-change', (event: any) => {
				expect(event.field).toBe('currentAttachments');
				expect(event.newValue).toHaveLength(1);
				done();
			});

			state.addAttachment(attachment);
		});
	});

	describe('Streaming State', () => {
		it('should initialize with streaming disabled', () => {
			expect(state.isStreaming).toBe(false);
		});

		it('should set streaming state', () => {
			state.isStreaming = true;

			expect(state.isStreaming).toBe(true);
		});

		it('should initialize with stop not requested', () => {
			expect(state.stopStreamingRequested).toBe(false);
		});

		it('should request stop streaming', () => {
			state.stopStreamingRequested = true;

			expect(state.stopStreamingRequested).toBe(true);
		});
	});

	describe('Agent Execution', () => {
		it('should initialize with no execution steps', () => {
			expect(state.agentExecutionSteps).toEqual([]);
		});

		it('should add execution step', () => {
			const step = {
				type: 'thought' as const,
				content: 'Thinking about the problem',
				timestamp: Date.now()
			};

			state.addAgentExecutionStep(step);

			expect(state.agentExecutionSteps).toHaveLength(1);
			expect(state.agentExecutionSteps[0]).toEqual(step);
		});

		it('should clear execution steps', () => {
			state.addAgentExecutionStep({
				type: 'thought',
				content: 'Test',
				timestamp: Date.now()
			});
			state.clearAgentExecutionSteps();

			expect(state.agentExecutionSteps).toEqual([]);
		});
	});

	describe('Reset Functionality', () => {
		it('should reset all state to defaults', () => {
			// Set some non-default values
			state.addMessage({ role: 'user', content: 'Test' });
			state.currentConversationId = 'conv-123';
			state.temperature = 0.9;
			state.maxTokens = 2000;
			state.mode = 'agent';
			state.enableRAG = true;
			state.enableWebSearch = true;
			state.conversationListVisible = true;
			state.conversationListPinned = true;
			state.addAttachment({ type: 'file', name: 'test.md', path: '/test.md', content: 'Test' });
			state.isStreaming = true;
			state.stopStreamingRequested = true;
			state.addAgentExecutionStep({ type: 'thought', content: 'Test', timestamp: Date.now() });

			// Reset
			state.reset();

			// Verify defaults
			expect(state.messages).toEqual([]);
			expect(state.currentConversationId).toBeNull();
			expect(state.temperature).toBe(0.7);
			expect(state.maxTokens).toBe(4000);
			expect(state.mode).toBe('chat');
			expect(state.enableRAG).toBe(false);
			expect(state.enableWebSearch).toBe(false);
			expect(state.conversationListVisible).toBe(false);
			expect(state.conversationListPinned).toBe(false);
			expect(state.currentAttachments).toEqual([]);
			expect(state.isStreaming).toBe(false);
			expect(state.stopStreamingRequested).toBe(false);
			expect(state.agentExecutionSteps).toEqual([]);
		});
	});

	describe('Snapshot Functionality', () => {
		it('should provide state snapshot for debugging', () => {
			state.addMessage({ role: 'user', content: 'Test' });
			state.currentConversationId = 'conv-123';
			state.temperature = 0.9;
			state.mode = 'agent';
			state.enableRAG = true;

			const snapshot = state.getSnapshot();

			expect(snapshot).toMatchObject({
				messagesCount: 1,
				currentConversationId: 'conv-123',
				temperature: 0.9,
				mode: 'agent',
				enableRAG: true
			});
		});

		it('should provide snapshot with counts for collections', () => {
			state.addMessage({ role: 'user', content: 'Message 1' });
			state.addMessage({ role: 'assistant', content: 'Message 2' });
			state.addAttachment({ type: 'file', name: 'test.md', path: '/test.md', content: 'Test' });

			const snapshot = state.getSnapshot();

			expect(snapshot.messagesCount).toBe(2);
			expect(snapshot.currentAttachmentsCount).toBe(1);
		});
	});

	describe('Event System', () => {
		it('should emit state-change events for all property changes', () => {
			const changeEvents: string[] = [];

			state.on('state-change', (event: any) => {
				changeEvents.push(event.field);
			});

			state.currentConversationId = 'conv-123';
			state.temperature = 0.9;
			state.mode = 'agent';
			state.enableRAG = true;

			expect(changeEvents).toEqual([
				'currentConversationId',
				'temperature',
				'mode',
				'enableRAG'
			]);
		});

		it('should include old and new values in event', (done) => {
			state.temperature = 0.7; // Set initial

			state.on('state-change', (event: any) => {
				expect(event.field).toBe('temperature');
				expect(event.oldValue).toBe(0.7);
				expect(event.newValue).toBe(0.9);
				done();
			});

			state.temperature = 0.9;
		});
	});
});
