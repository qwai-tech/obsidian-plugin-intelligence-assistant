/**
 * Conversation Manager
 * Handles conversation lifecycle, UI rendering, and persistence
 */

import {App, Menu} from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { Events } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Conversation, Message } from '@/types';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ConversationStorageService } from '@/application/services/conversation-storage-service';

/**
 * Events emitted by ConversationManager
 */
export interface ConversationManagerEvents {
	'conversation-loaded': (conversation: Conversation) => void;
	'conversation-created': (conversation: Conversation) => void;
	'conversation-updated': (conversation: Conversation) => void;
	'conversation-deleted': (conversationId: string) => void;
	'list-toggled': (visible: boolean) => void;
}

export class ConversationManager extends Events {
	private conversationListContainer: HTMLElement;
	private storageService: ConversationStorageService | null = null;
	private storageReadyPromise: Promise<void> | null = null;

	constructor(
		private app: App,
		private plugin: IntelligenceAssistantPlugin,
		private state: ChatViewState,
		private chatContainer: HTMLElement,
		private modelSelect: HTMLSelectElement,
		private addMessageToUI: (message: Message) => HTMLElement,
		private updateTokenSummary: () => void
	) {
		super();
		this.storageReadyPromise = this.initializeStorageService();
	}

	private async initializeStorageService(): Promise<void> {
		this.storageService = await this.plugin.getConversationStorageService();
	}

	private async ensureStorageReady(): Promise<void> {
		if (this.storageService) return;
		if (!this.storageReadyPromise) {
			this.storageReadyPromise = this.initializeStorageService();
		}
		await this.storageReadyPromise;
	}

	/**
	 * Initialize the conversation list container
	 */
	async initializeContainer(container: HTMLElement): Promise<void> {
		this.conversationListContainer = container;
		await this.ensureStorageReady();
		await this.renderConversationList();
	}

	/**
	 * Load or create initial conversation
	 */
	async loadOrCreateConversation(): Promise<void> {
		await this.ensureStorageReady();
		const storage = this.storageService!;
		// Try to load active conversation
		if (this.plugin.settings.activeConversationId) {
			const conv = await storage.loadConversation(this.plugin.settings.activeConversationId);
			if (_conv) {
				this.loadConversation(_conv);
				return;
			}
		}

		// Try to load most recent conversation from storage
		const allConversationsMetadata = await storage.getAllConversationsMetadata();
		if (allConversationsMetadata.length > 0) {
			// Sort by updatedAt to get the most recent
			const sortedConversations = allConversationsMetadata.sort((a, b) => b.updatedAt - a.updatedAt);
			const mostRecent = await storage.loadConversation(sortedConversations[0].id);
			if (mostRecent) {
				this.loadConversation(mostRecent);
				return;
			}
		}

		// Create new conversation
		await this.createNewConversation();
	}

	/**
	 * Create a new conversation
	 */
	async createNewConversation(): Promise<void> {
		await this.ensureStorageReady();
		const storage = this.storageService!;
		const newConv: Conversation = {
			id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			title: 'New Conversation',
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			mode: this.state.mode,
			config: this.buildCurrentConversationConfig()
		};

		// Save to storage service
		await storage.createConversation(newConv);
		
		this.plugin.settings.activeConversationId = newConv.id;
		await this.plugin.saveSettings();

		this.loadConversation(newConv);
		this.renderConversationList();

		// Close conversation list after creating new conversation (only if not pinned)
		if (!this.state.conversationListPinned) {
			this.state.conversationListVisible = false;
			this.conversationListContainer.addClass('ia-hidden');
		}

		this.trigger('conversation-created', newConv);
	}

	/**
	 * Load a conversation
	 */
	loadConversation(conv: Conversation): void {
		this.state.currentConversationId = conv.id;
		this.state.messages = conv.messages;
		if (conv.mode) {
			this.state.mode = conv.mode;
		}
		if (conv.config) {
			if (typeof conv.config.temperature === 'number') {
				this.state.temperature = conv.config.temperature;
			}
			if (typeof conv.config.maxTokens === 'number') {
				this.state.maxTokens = conv.config.maxTokens;
			}
			if (typeof conv.config.ragEnabled === 'boolean') {
				this.state.enableRAG = conv.config.ragEnabled;
			}
			if (typeof conv.config.webSearchEnabled === 'boolean') {
				this.state.enableWebSearch = conv.config.webSearchEnabled;
			}
		}
		this.plugin.settings.activeConversationId = conv.id;

		// Re-render messages
		this.chatContainer.empty();
		this.state.messages.forEach(msg => this.addMessageToUI(msg));

		// Update token summary after loading conversation
		this.updateTokenSummary();

		// Update the model selector to reflect the model used in the conversation
		// Find the most recently used model in the conversation (from assistant messages)
		const configuredModel = conv.config?.modelId;
		const lastModelUsed = this.getLastUsedModel(_conv);
		const targetModel = configuredModel || lastModelUsed;
		if (targetModel && this.modelSelect.querySelector(`option[value="${targetModel}"]`)) {
			this.modelSelect.value = targetModel;
		}

		this.renderConversationList();
		this.trigger('conversation-loaded', conv);
	}

	/**
	 * Switch to a different conversation
	 */
	async switchConversation(convId: string): Promise<void> {
		await this.ensureStorageReady();
		// Don't switch if already on the same conversation
		if (this.state.currentConversationId === convId) {
			return;
		}
		
		// Save current conversation before switching (skip re-render to avoid double render)
		await this.saveCurrentConversation(true);

		const storage = this.storageService!;
		const conv = await storage.loadConversation(convId);
		if (_conv) {
			this.loadConversation(_conv);
			await this.plugin.saveSettings();
			// Close conversation list after switching (only if not pinned)
			if (!this.state.conversationListPinned) {
				this.state.conversationListVisible = false;
				this.conversationListContainer.addClass('ia-hidden');
			}
		}
	}

	/**
	 * Save the current conversation
	 */
	async saveCurrentConversation(skipRender: boolean = false): Promise<void> {
		if (!this.state.currentConversationId) return;
		await this.ensureStorageReady();
		const storage = this.storageService!;

		// Get the existing conversation to preserve metadata
		let existingConv = await storage.loadConversation(this.state.currentConversationId);
		
		if (!existingConv) {
			// If conversation doesn't exist, create a new one
			existingConv = {
				id: this.state.currentConversationId,
				title: 'New Conversation',
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
		}

		const conv = { ...existingConv }; // Create a copy

		// Update messages (filter out system messages before saving)
		conv.messages = this.state.messages.filter(m => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string; model?: string }>;
		conv.updatedAt = Date.now();
		conv.mode = this.state.mode;
		conv.config = this.buildCurrentConversationConfig();

		// Auto-generate/update title based on settings (only once for new conversations)
		const shouldUpdateTitle = this.shouldUpdateConversationTitle(_conv);
		if (shouldUpdateTitle) {
			const newTitle = await this.generateConversationTitle(_conv);
			if (newTitle) {
				conv.title = newTitle;
				if (this.plugin.settings.conversationIconEnabled && !conv.icon) {
					const newIcon = await this.generateConversationIcon(newTitle);
					if (newIcon) {
						conv.icon = newIcon;
					}
				}
			}
		}

		// Save the updated conversation to storage
		await storage.updateConversation(_conv);

		// Only re-render if not skipped (e.g., when switching conversations)
		if (!skipRender) {
			this.renderConversationList();
		}

		this.trigger('conversation-updated', conv);
	}

	private buildCurrentConversationConfig(): Conversation['config'] {
		return {
			modelId: this.getEffectiveModelIdForState(),
			promptId: this.state.mode === 'chat' ? (this.plugin.settings.activeSystemPromptId ?? null) : null,
			agentId: this.state.mode === 'agent' ? (this.plugin.settings.activeAgentId ?? null) : null,
			temperature: this.state.temperature,
			maxTokens: this.state.maxTokens,
			ragEnabled: this.state.enableRAG,
			webSearchEnabled: this.state.enableWebSearch
		};
	}

	private getEffectiveModelIdForState(): string | undefined {
		const selectedModel = this.modelSelect?.value?.trim();
		if (this.state.mode === 'agent') {
			const agentId = this.plugin.settings.activeAgentId;
			const agent = agentId ? this.plugin.settings.agents.find(a => a.id === agentId) : null;
			if (agent) {
				switch (agent.modelStrategy?.strategy) {
					case 'fixed':
						return agent.modelStrategy.modelId || this.plugin.settings.defaultModel || selectedModel || undefined;
					case 'default':
						return this.plugin.settings.defaultModel || selectedModel || undefined;
					case 'chat-view':
					default:
						return selectedModel || this.plugin.settings.defaultModel || undefined;
				}
			}
		}
		return selectedModel || this.plugin.settings.defaultModel || undefined;
	}

	/**
	 * Delete a conversation
	 */
	async deleteConversation(convId: string): Promise<void> {
		await this.ensureStorageReady();
		const storage = this.storageService!;
		const conv = await storage.getConversationMetadata(convId);
		if (!conv) return;

		if (!await showConfirm(this.app, `Delete conversation "${conv.title}"?`)) return;

		// Delete from storage service
		const deleted = await storage.deleteConversation(convId);
		if (!deleted) return;

		// If deleting current conversation, switch to another or create new
		if (convId === this.state.currentConversationId) {
			const allConversationsMetadata = await storage.getAllConversationsMetadata();
			if (allConversationsMetadata.length > 0) {
				// Load the most recent conversation
				const sortedConversations = allConversationsMetadata.sort((a, b) => b.updatedAt - a.updatedAt);
				const mostRecentConv = await storage.loadConversation(sortedConversations[0].id);
				if (mostRecentConv) {
					this.loadConversation(mostRecentConv);
				}
			} else {
				await this.createNewConversation();
			}
		}

		this.renderConversationList();
		this.trigger('conversation-deleted', convId);
	}

	/**
	 * Rename a conversation
	 */
	async renameConversation(convId: string): Promise<void> {
		await this.ensureStorageReady();
		const storage = this.storageService!;
		const conv = await storage.getConversationMetadata(convId);
		if (!conv) return;

		const newTitle = prompt('Enter new title:', conv.title);
		if (newTitle && newTitle.trim()) {
			const success = await storage.renameConversation(convId, newTitle.trim());
			if (success) {
				// Reload the conversation if it's the current one to reflect the changes
				if (convId === this.state.currentConversationId) {
					const updatedConv = await storage.loadConversation(convId);
					if (updatedConv) {
						// Update the state without reloading the UI to avoid flickering
						updatedConv.title = newTitle.trim();
						this.state.currentConversationId = updatedConv.id;
						this.state.messages = updatedConv.messages;
					}
				}
				this.renderConversationList();
				
				// Trigger update event with the updated metadata
				const updatedMetadata = await storage.getConversationMetadata(convId);
				if (updatedMetadata) {
					this.trigger('conversation-updated', { 
						id: convId, 
						title: updatedMetadata.title,
						messages: this.state.messages
					});
				}
			}
		}
	}

	/**
	 * Toggle conversation list visibility
	 */
	async toggleConversationList(): Promise<void> {
		this.state.conversationListVisible = !this.state.conversationListVisible;
		if (this.state.conversationListVisible) {
			this.conversationListContainer.removeClass('ia-hidden');
		} else {
			this.conversationListContainer.addClass('ia-hidden');
		}
		await this.renderConversationList();
		this.trigger('list-toggled', this.state.conversationListVisible);
	}

	/**
	 * Toggle conversation list pinned state
	 */
	async togglePinConversationList(): Promise<void> {
		this.state.conversationListPinned = !this.state.conversationListPinned;
		this.updateConversationListStyle();
		await this.renderConversationList();
	}

	/**
	 * Update conversation list style based on pinned state
	 */
	private updateConversationListStyle(): void {
		if (this.state.conversationListPinned) {
			// Pinned mode: fixed sidebar
			this.conversationListContainer.setCssProps({ 'position': 'relative' });
			this.conversationListContainer.setCssProps({ 'box-shadow': 'none' });
			this.state.conversationListVisible = true;
			this.conversationListContainer.removeClass('ia-hidden');
		} else {
			// Floating mode: overlay
			this.conversationListContainer.setCssProps({ 'position': 'absolute' });
			this.conversationListContainer.setCssProps({ 'box-shadow': '2px 0 8px rgba(0, 0, 0, 0.1)' });
		}
	}

	/**
	 * Render the conversation list UI
	 */
	async renderConversationList(): Promise<void> {
		await this.ensureStorageReady();
		const storage = this.storageService!;
		this.conversationListContainer.empty();

		// Header with new conversation button and pin button
		const listHeader = this.conversationListContainer.createDiv('conversation-list-header');
		listHeader.createEl('h3', { text: 'Conversations' });

		const headerButtons = listHeader.createDiv('conversation-header-buttons');
		headerButtons.removeClass('ia-hidden');
		headerButtons.setCssProps({ 'gap': '4px' });

		// Pin/Unpin button
		const pinBtn = headerButtons.createEl('button', { text: this.state.conversationListPinned ? '📌' : '📍' });
		pinBtn.addClass('pin-conversation-btn');
		pinBtn.title = this.state.conversationListPinned ? 'Unpin' : 'Pin to sidebar';
		pinBtn.addEventListener('click', () => this.togglePinConversationList());

		const newConvBtn = headerButtons.createEl('button', { text: '+' });
		newConvBtn.addClass('new-conversation-btn');
		newConvBtn.title = 'New Conversation';
		newConvBtn.addEventListener('click', () => this.createNewConversation());

		// Conversation list
		const listContent = this.conversationListContainer.createDiv('conversation-list-content');

		// Get all conversations metadata instead of the array from settings
		const conversationsMetadata = await storage.getAllConversationsMetadata();
		
		if (conversationsMetadata.length === 0) {
			listContent.createDiv('empty-state').setText('No conversations yet');
			return;
		}

		// Sort by updatedAt (most recent first)
		const sortedConversations = conversationsMetadata.sort((a, b) => b.updatedAt - a.updatedAt);

		sortedConversations.forEach(conv => {
			const convItem = listContent.createDiv('conversation-item');
			convItem.removeClass('ia-hidden');
			convItem.setCssProps({ 'align-items': 'center' });
			convItem.setCssProps({ 'justify-content': 'space-between' });
			convItem.setCssProps({ 'gap': '8px' });
			convItem.setCssProps({ 'padding': '8px 12px' });
			convItem.addClass('ia-clickable');
			convItem.setCssProps({ 'border-radius': '4px' });

			if (conv.id === this.state.currentConversationId) {
				convItem.addClass('active');
				convItem.setCssProps({ 'background': 'var(--background-modifier-hover)' });
			}

			const convTitle = convItem.createDiv('conversation-title');
			convTitle.setCssProps({ 'flex': '1' });
			convTitle.setCssProps({ 'overflow': 'hidden' });
			convTitle.setCssProps({ 'text-overflow': 'ellipsis' });
			convTitle.setCssProps({ 'white-space': 'nowrap' });

			// Add icon if enabled and available
			if (this.plugin.settings.conversationIconEnabled && conv.icon) {
				const icon = convTitle.createSpan('conversation-icon');
				icon.setText(conv.icon + ' ');
			}

			convTitle.createSpan().setText(conv.title);
			convTitle.addEventListener('click', () => this.switchConversation(conv.id));

			// Actions container
			const actions = convItem.createDiv('conversation-actions');
			actions.removeClass('ia-hidden');
			actions.setCssProps({ 'gap': '4px' });
			actions.setCssProps({ 'opacity': '0' });
			actions.setCssProps({ 'transition': 'opacity 0.2s' });

			// Show actions on hover
			convItem.addEventListener('mouseenter', () => {
				actions.setCssProps({ 'opacity': '1' });
			});
			convItem.addEventListener('mouseleave', () => {
				actions.setCssProps({ 'opacity': '0' });
			});

			// Delete button
			const deleteBtn = actions.createEl('button', { text: '🗑️' });
			deleteBtn.title = 'Delete';
			deleteBtn.setCssProps({ 'padding': '4px 6px' });
			deleteBtn.setCssProps({ 'font-size': '12px' });
			deleteBtn.setCssProps({ 'border': 'none' });
			deleteBtn.setCssProps({ 'background': 'transparent' });
			deleteBtn.addClass('ia-clickable');
			deleteBtn.setCssProps({ 'border-radius': '3px' });
			deleteBtn.setCssProps({ 'color': 'var(--text-error)' });
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.deleteConversation(conv.id);
			});

			// Context menu for additional options
			convItem.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();

				menu.addItem((item) => {
					item.setTitle('Delete')
						.setIcon('trash')
						.onClick(() => this.deleteConversation(conv.id));
				});

				menu.showAtMouseEvent(e);
			});
		});
	}

	/**
	 * Check if conversation title should be auto-updated
	 */
	private shouldUpdateConversationTitle(conv: Conversation): boolean {
		// Only generate title once for "New Conversation" with at least 2 messages
		if (conv.title === 'New Conversation' && this.state.messages.length >= 2) {
			return true;
		}

		// Never auto-update after initial generation
		return false;
	}

	/**
	 * Generate a title for a conversation using LLM or first message
	 */
	private async generateConversationTitle(conv: Conversation): Promise<string | null> {
		const mode = this.plugin.settings.conversationTitleMode;

		if (mode === 'first-message') {
			const firstUserMsg = this.state.messages.find(m => m.role === 'user');
			if (firstUserMsg) {
				return firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
			}
		} else if (mode === 'llm-summary') {
			try {
				const titleModel = this.plugin.settings.titleSummaryModel || this.modelSelect.value;
				if (!titleModel) return null;

				const config = ModelManager.findConfigForModelByProvider(titleModel, this.plugin.settings.llmConfigs);
				if (!config) return null;

				let contextMessages: Message[];
				if (this.state.messages.length <= 4) {
					contextMessages = this.state.messages.slice(0, 4);
				} else {
					const first = this.state.messages.slice(0, 2);
					const last = this.state.messages.slice(-2);
					contextMessages = [...first, ...last];
				}

				const conversationText = contextMessages
					.map(m => `${m.role}: ${m.content.substring(0, 200)}`)
					.join('\n\n');

				const promptTemplate = this.plugin.settings.titleSummaryPrompt ||
					'Generate a short, descriptive title (max 6 words) for this conversation:\n\n{conversation}\n\nTitle:';
				const prompt = promptTemplate.replace('{conversation}', conversationText);

				const modelConfig = { ...config, model: titleModel, temperature: 0.3 };
				const provider = ProviderFactory.createProvider(modelConfig);

				const response = await provider.chat({
					messages: [{ role: 'user', content: prompt }],
					model: titleModel,
					temperature: 0.3
				});

				let title = response.content.trim().replace(/^["']|["']$/g, '').replace(/^Title:\s*/i, '');

				if (title.length > 0 && title.length <= 100) {
					return title;
				}
			} catch (error) {
				console.error('Failed to generate LLM title:', error);
			}
		}

		// Fallback to first message if LLM summary fails or is not enabled
		const firstUserMsg = this.state.messages.find(m => m.role === 'user');
		if (firstUserMsg) {
			return firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
		}

		return 'New Conversation'; // Should not happen if there are messages
	}

	/**
	 * Get the most recently used model from the conversation
	 */
	private getLastUsedModel(conv: Conversation): string | null {
		// Look through messages in reverse order to find the last used model
		for (let i = conv.messages.length - 1; i >= 0; i--) {
			const msg = conv.messages[i];
			// Only consider assistant messages as they contain the model information
			if (msg.role === 'assistant' && msg.model) {
				return msg.model;
			}
		}
		return null;
	}

	/**
	 * Generate an emoji icon for a conversation
	 */
	private async generateConversationIcon(title: string): Promise<string | null> {
		try {
			const modelId = this.plugin.settings.titleSummaryModel || this.modelSelect.value;
			if (!modelId) return null;

			const config = ModelManager.findConfigForModelByProvider(modelId, this.plugin.settings.llmConfigs);
			if (!config) return null;

			const modelConfig = { ...config, model: modelId, temperature: 0.5 };
			const provider = ProviderFactory.createProvider(modelConfig);

			const response = await provider.chat({
				messages: [
					{
						role: 'user',
						content: `Suggest a single emoji icon that represents this conversation: "${title}". Reply with only the emoji, no text.`
					}
				],
				model: modelId,
				temperature: 0.5
			});

			const icon = response.content.trim().match(/[\p{Emoji}]/u)?.[0];
			if (icon) {
				return icon;
			}
		} catch (error) {
			console.error('Failed to generate icon:', error);
		}
		return null;
	}
}
