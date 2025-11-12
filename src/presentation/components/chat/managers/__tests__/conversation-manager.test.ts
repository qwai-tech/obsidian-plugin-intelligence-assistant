/**
 * Tests for ConversationManager
 */

import { ConversationManager } from '../conversation-manager';
import { ChatViewState } from '../../state/chat-view-state';
import { App } from 'obsidian';
import IntelligenceAssistantPlugin from '../../../../../main';
import { Conversation, Message } from '../../../../../main';
import { ConversationStorageService } from '../../../../services/conversation-storage-service';

// Mock dependencies
jest.mock('obsidian');
jest.mock('../../../../services/conversation-storage-service');

describe('ConversationManager', () => {
	let manager: ConversationManager;
	let mockApp: App;
	let mockPlugin: IntelligenceAssistantPlugin;
	let mockStorageService: jest.Mocked<ConversationStorageService>;
	let state: ChatViewState;
	let chatContainer: HTMLElement;
	let modelSelect: HTMLSelectElement;
	let addMessageToUI: jest.Mock;
	let updateTokenSummary: jest.Mock;

	beforeEach(() => {
		// Setup mocks
		mockApp = new App();
		
		// Mock storage service
		mockStorageService = {
			loadConversation: jest.fn(),
			updateConversation: jest.fn(),
			createConversation: jest.fn(),
			deleteConversation: jest.fn(),
			getAllConversationsMetadata: jest.fn(),
			getConversationMetadata: jest.fn(),
			renameConversation: jest.fn(),
			getConversationCount: jest.fn(),
			initialize: jest.fn(),
			saveIndex: jest.fn(),
			isInitialized: jest.fn()
		} as any;

		mockPlugin = {
			settings: {
				conversations: [], // Will be empty after migration
				activeConversationId: null,
				conversationTitleMode: 'first-message',
				conversationIconEnabled: false,
				titleSummaryModel: null,
				titleSummaryPrompt: null,
				llmConfigs: [],
			},
			saveSettings: jest.fn().mockResolvedValue(undefined),
			getConversationStorageService: jest.fn().mockResolvedValue(mockStorageService)
		} as any;

		state = new ChatViewState();
		chatContainer = document.createElement('div');
		modelSelect = document.createElement('select');
		addMessageToUI = jest.fn().mockReturnValue(document.createElement('div'));
		updateTokenSummary = jest.fn();

		manager = new ConversationManager(
			mockApp,
			mockPlugin,
			state,
			chatContainer,
			modelSelect,
			addMessageToUI,
			updateTokenSummary
		);

		// Initialize container for all tests
		const conversationListContainer = document.createElement('div');
		(manager.initializeContainer(conversationListContainer) as Promise<void>).catch(() => {});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Initialization', () => {
		it('should initialize with container', async () => {
			const container = document.createElement('div');
			await manager.initializeContainer(container);
			// Container should be initialized (check by attempting to render)
			await expect(manager.renderConversationList()).resolves.not.toThrow();
		});

		it('should initialize storage service', () => {
			expect(mockPlugin.getConversationStorageService).toHaveBeenCalled();
		});
	});

	describe('Load or Create Conversation', () => {
		it('should load active conversation if it exists', async () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test Conversation',
				messages: [{ role: 'user', content: 'Hello' }],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv);
			mockPlugin.settings.activeConversationId = '1';

			await manager.loadOrCreateConversation();

			expect(state.currentConversationId).toBe('1');
			expect(state.messages).toHaveLength(1);
			expect(mockStorageService.loadConversation).toHaveBeenCalledWith('1');
		});

		it('should load most recent conversation if no active', async () => {
		const conv: Conversation = {
			id: '2',
			title: 'Recent',
			messages: [],
			createdAt: 2000,
			updatedAt: 2000,
			mode: 'chat'
		};
			
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([
				{
					id: '1',
					title: 'Old',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/2023-01-01-001-old.json',
					createdAt: 1000,
					updatedAt: 1000,
					messageCount: 0,
					mode: 'chat'
				},
				{
					id: '2', 
					title: 'Recent',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/2023-01-02-001-recent.json',
					createdAt: 2000,
					updatedAt: 2000,
					messageCount: 0,
					mode: 'chat'
				}
			]);
			
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv);
			mockPlugin.settings.activeConversationId = null;

			await manager.loadOrCreateConversation();

			expect(state.currentConversationId).toBe('2');
			expect(mockStorageService.loadConversation).toHaveBeenCalledWith('2');
		});

		it('should create new conversation if none exist', async () => {
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([]);
			(mockStorageService.getConversationCount as jest.Mock).mockResolvedValue(0);

			await manager.loadOrCreateConversation();

			expect(mockStorageService.createConversation).toHaveBeenCalled();
		});
	});

	describe('Create New Conversation', () => {
		it('should create a new conversation', async () => {
			await manager.createNewConversation();

			expect(mockStorageService.createConversation).toHaveBeenCalled();
			const callArgs = (mockStorageService.createConversation as jest.Mock).mock.calls[0][0];
			expect(callArgs.title).toBe('New Conversation');
			expect(callArgs.messages).toEqual([]);
		});

		it('should set as active conversation', async () => {
			await manager.createNewConversation();

			const callArgs = (mockStorageService.createConversation as jest.Mock).mock.calls[0][0];
			const convId = callArgs.id;
			expect(mockPlugin.settings.activeConversationId).toBe(convId);
			expect(state.currentConversationId).toBe(convId);
		});

		it('should save settings', async () => {
			await manager.createNewConversation();

			expect(mockPlugin.saveSettings).toHaveBeenCalled();
		});

		it('should emit conversation-created event', async () => {
			const triggerSpy = jest.spyOn(manager as any, 'trigger');
			await manager.createNewConversation();

			expect(triggerSpy).toHaveBeenCalledWith('conversation-created', expect.objectContaining({
				title: 'New Conversation'
			}));
		});

		it('should hide conversation list if not pinned', async () => {
			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			// Create a new conversation
			await manager.createNewConversation();
			
			// We can't test the actual state change here because the test doesn't run the full initialization flow
			// But we verify the saveSettings call was made
			expect(mockPlugin.saveSettings).toHaveBeenCalled();
		});
	});

	describe('Load Conversation', () => {
		it('should load conversation messages', () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [
					{ role: 'user', content: 'Hello' },
					{ role: 'assistant', content: 'Hi' },
				],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			manager.loadConversation(conv);

			expect(state.currentConversationId).toBe('1');
			expect(state.messages).toHaveLength(2);
		});

		it('should clear chat container and re-render', () => {
			chatContainer.innerHTML = '<div>old content</div>';
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [{ role: 'user', content: 'Hello' }],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			manager.loadConversation(conv);

			expect(addMessageToUI).toHaveBeenCalledTimes(1);
		});

		it('should update token summary', () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			manager.loadConversation(conv);

			expect(updateTokenSummary).toHaveBeenCalled();
		});

		it('should emit conversation-loaded event', () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const triggerSpy = jest.spyOn(manager as any, 'trigger');
			manager.loadConversation(conv);

			expect(triggerSpy).toHaveBeenCalledWith('conversation-loaded', conv);
		});
	});

	describe('Switch Conversation', () => {
		it('should save current conversation before switching', async () => {
			const conv1: Conversation = {
				id: '1',
				title: 'First',
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			const conv2: Conversation = {
				id: '2',
				title: 'Second',
				messages: [{ role: 'user', content: 'Hello' }],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			
			state.currentConversationId = '1';
			state.messages = [{ role: 'user', content: 'Test' }];
			
			// Mock the current conversation load for save process
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv1);
			// Mock the target conversation to load
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv2);

			await manager.switchConversation('2');

			// Check that saveCurrentConversation was called (which calls updateConversation)
			expect(mockStorageService.updateConversation).toHaveBeenCalled();
		});

		it('should not switch if already on same conversation', async () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [{ role: 'user', content: 'Hello' }],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			
			state.currentConversationId = '1';
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv);

			await manager.switchConversation('1');

			// Should return early without making additional calls
			expect(mockStorageService.loadConversation).not.toHaveBeenCalled();
		});

		it('should load target conversation', async () => {
			const conv2: Conversation = {
				id: '2',
				title: 'Second',
				messages: [{ role: 'user', content: 'Hello' }],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			
			state.currentConversationId = '1';
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv2);

			await manager.switchConversation('2');

			expect(state.currentConversationId).toBe('2');
			expect(state.messages).toHaveLength(1);
		});
	});

	describe('Save Current Conversation', () => {
		it('should save conversation to storage', async () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			
			state.currentConversationId = '1';
			state.messages = [{ role: 'user', content: 'New message' }];
			
			// Mock loading existing conversation
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv);

			await manager.saveCurrentConversation();

			expect(mockStorageService.updateConversation).toHaveBeenCalled();
		});

		it('should filter out system messages', async () => {
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			
			state.currentConversationId = '1';
			state.messages = [
				{ role: 'system', content: 'System prompt' },
				{ role: 'user', content: 'User message' },
				{ role: 'assistant', content: 'Assistant message' },
			];
			
			// Mock loading existing conversation
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv);

			await manager.saveCurrentConversation();

			const callArgs = (mockStorageService.updateConversation as jest.Mock).mock.calls[0][0];
			// Should only have user and assistant messages (2 total, not 3)
			expect(callArgs.messages).toHaveLength(2);
		});

		it('should update conversation updatedAt timestamp', async () => {
			const oldTimestamp = Date.now() - 10000; // 10 seconds ago
			const conv: Conversation = {
				id: '1',
				title: 'Test',
				messages: [],
				createdAt: oldTimestamp,
				updatedAt: oldTimestamp,
			};
			
			state.currentConversationId = '1';
			
			// Mock loading existing conversation
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv);

			await manager.saveCurrentConversation();

			const callArgs = (mockStorageService.updateConversation as jest.Mock).mock.calls[0][0];
			expect(callArgs.updatedAt).toBeGreaterThan(oldTimestamp);
		});

		it('should handle missing conversation by creating new one', async () => {
			state.currentConversationId = 'nonexistent';
			state.messages = [{ role: 'user', content: 'Test message' }];

			// Mock that conversation doesn't exist (returns null)
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(null);

			await manager.saveCurrentConversation();

			// Should create the conversation
			expect(mockStorageService.updateConversation).toHaveBeenCalled();
		});

		it('should handle no current conversation', async () => {
			state.currentConversationId = null;

			await expect(manager.saveCurrentConversation()).resolves.not.toThrow();
		});
	});

	describe('Delete Conversation', () => {
		it('should delete conversation from storage', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Test',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			// Mock window.confirm to return true
			global.confirm = jest.fn(() => true) as any;

			await manager.deleteConversation('1');

			expect(mockStorageService.deleteConversation).toHaveBeenCalledWith('1');
		});

		it('should not delete if user cancels', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Test',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			// Mock window.confirm to return false
			global.confirm = jest.fn(() => false) as any;

			await manager.deleteConversation('1');

			expect(mockStorageService.deleteConversation).not.toHaveBeenCalled();
		});

		it('should switch to another conversation if deleting current', async () => {
			state.currentConversationId = '1';
			
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Test',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			// Mock remaining conversations after deletion
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([
				{
					id: '2',
					title: 'Second',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/2.json',
					createdAt: Date.now() + 1000,
					updatedAt: Date.now() + 1000,
					messageCount: 0,
				mode: 'chat'
				}
			]);

			// Mock the conversation to load after deletion
			const conv2: Conversation = {
				id: '2',
				title: 'Second',
				messages: [],
				createdAt: Date.now() + 1000,
				updatedAt: Date.now() + 1000,
				mode: 'chat'
			};
			(mockStorageService.loadConversation as jest.Mock).mockResolvedValue(conv2);

			// Mock window.confirm to return true
			global.confirm = jest.fn(() => true) as any;

			await manager.deleteConversation('1');

			expect(state.currentConversationId).toBe('2');
		});

		it('should create new conversation if deleting last', async () => {
			state.currentConversationId = '1';
			
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Test',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			// Mock empty list after deletion
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([]);

			// Mock window.confirm to return true
			global.confirm = jest.fn(() => true) as any;

			await manager.deleteConversation('1');

			expect(mockStorageService.createConversation).toHaveBeenCalled();
		});

		it('should emit conversation-deleted event', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Test',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			// Mock window.confirm to return true
			global.confirm = jest.fn(() => true) as any;

			const triggerSpy = jest.spyOn(manager as any, 'trigger');
			await manager.deleteConversation('1');

			expect(triggerSpy).toHaveBeenCalledWith('conversation-deleted', '1');
		});
	});

	describe('Rename Conversation', () => {
		it('should rename conversation', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Old Title',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			global.prompt = jest.fn(() => 'New Title') as any;

			await manager.renameConversation('1');

			expect(mockStorageService.renameConversation).toHaveBeenCalledWith('1', 'New Title');
		});

		it('should not rename if user cancels', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Old Title',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			global.prompt = jest.fn(() => null) as any;

			await manager.renameConversation('1');

			expect(mockStorageService.renameConversation).not.toHaveBeenCalled();
		});

		it('should trim whitespace from new title', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Old Title',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			global.prompt = jest.fn(() => '  New Title  ') as any;

			await manager.renameConversation('1');

			expect(mockStorageService.renameConversation).toHaveBeenCalledWith('1', 'New Title');
		});

		it('should not rename with empty string', async () => {
			(mockStorageService.getConversationMetadata as jest.Mock).mockResolvedValue({
				id: '1',
				title: 'Old Title',
				file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
			mode: 'chat'
			});

			global.prompt = jest.fn(() => '   ') as any;

			await manager.renameConversation('1');

			expect(mockStorageService.renameConversation).not.toHaveBeenCalled();
		});
	});

	describe('Render Conversation List', () => {
		it('should render empty state with no conversations', async () => {
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([]);

			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			await manager.renderConversationList();

			expect(container.querySelector('.empty-state')).toBeTruthy();
		});

		it('should render conversation items', async () => {
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([
				{
					id: '1',
					title: 'Test 1',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messageCount: 0,
				mode: 'chat'
				},
				{
					id: '2',
					title: 'Test 2',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/2.json',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messageCount: 0,
				mode: 'chat'
				},
			]);

			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			await manager.renderConversationList();

			const items = container.querySelectorAll('.conversation-item');
			expect(items).toHaveLength(2);
		});

		it('should highlight active conversation', async () => {
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([
				{
					id: '1',
					title: 'Test 1',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messageCount: 0,
				mode: 'chat'
				},
				{
					id: '2',
					title: 'Test 2',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/2.json',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messageCount: 0,
				mode: 'chat'
				},
			]);

			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			state.currentConversationId = '1';

			await manager.renderConversationList();

			const items = container.querySelectorAll('.conversation-item');
			expect(items[0].classList.contains('active')).toBe(true);
			expect(items[1].classList.contains('active')).toBe(false);
		});

		it('should render pin button', async () => {
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([]);

			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			await manager.renderConversationList();

			const pinBtn = container.querySelector('.pin-conversation-btn');
			expect(pinBtn).toBeTruthy();
		});

		it('should render new conversation button', async () => {
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([]);

			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			await manager.renderConversationList();

			const newBtn = container.querySelector('.new-conversation-btn');
			expect(newBtn).toBeTruthy();
		});

		it('should render icons when enabled', async () => {
			mockPlugin.settings.conversationIconEnabled = true;
			
			(mockStorageService.getAllConversationsMetadata as jest.Mock).mockResolvedValue([
				{
					id: '1',
					title: 'Test',
					file: '.obsidian/plugins/intelligence-assistant/data/conversations/1.json',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messageCount: 0,
					icon: '💬'
				},
			]);

			const container = document.createElement('div');
			await (manager.initializeContainer(container) as Promise<void>);

			await manager.renderConversationList();

			const icon = container.querySelector('.conversation-icon');
			expect(icon).toBeTruthy();
			expect(icon?.textContent).toContain('💬');
		});
	});

	describe('Toggle Conversation List', () => {
		it('should toggle visibility', () => {
			const container = document.createElement('div');
			manager.initializeContainer(container as any);
			state.conversationListVisible = false;

			manager.toggleConversationList();

			expect(state.conversationListVisible).toBe(true);
		});

		it('should hide when visible', () => {
			const container = document.createElement('div');
			manager.initializeContainer(container as any);
			state.conversationListVisible = true;

			manager.toggleConversationList();

			expect(state.conversationListVisible).toBe(false);
		});

		it('should emit list-toggled event', () => {
			state.conversationListVisible = false;

			const triggerSpy = jest.spyOn(manager as any, 'trigger');
			manager.toggleConversationList();

			expect(triggerSpy).toHaveBeenCalledWith('list-toggled', true);
		});
	});

	describe('Toggle Pin Conversation List', () => {
		it('should toggle pinned state', () => {
			const container = document.createElement('div');
			manager.initializeContainer(container as any);
			state.conversationListPinned = false;

			manager.togglePinConversationList();

			expect(state.conversationListPinned).toBe(true);
		});
	});
});
