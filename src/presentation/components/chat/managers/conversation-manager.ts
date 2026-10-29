import { App } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { showPrompt } from '@/presentation/components/modals/prompt-modal';
import { Events } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Conversation, Message } from '@/types';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import type { ConversationNamer } from '@/application/services/conversation-namer';
import { ConversationListView } from '@/presentation/components/chat/conversation-list-view';
import type { ConversationStorageService } from '@/infrastructure/persistence/conversation-storage-service';

export class ConversationManager extends Events {
	private conversationListContainer: HTMLElement;
	private listView: ConversationListView | null = null;

	constructor(
		private app: App,
		private plugin: IntelligenceAssistantPlugin,
		private readonly storage: ConversationStorageService,
		private readonly namer: ConversationNamer,
		private state: ChatViewState,
		private chatContainer: HTMLElement,
		private modelSelect: HTMLSelectElement,
		private renderMessageList: (_messages: Message[]) => void,
		private updateTokenSummary: () => void
	) {
		super();
	}

	/**
	 * Initialize the conversation list container
	 */
	async initializeContainer(container: HTMLElement): Promise<void> {
		this.conversationListContainer = container;
		this.listView = new ConversationListView(container, this.storage, this.state, this.plugin, {
			create: () => this.createNewConversation(),
			switchTo: (id) => this.switchConversation(id),
			remove: (id) => this.deleteConversation(id),
			rename: (id) => this.renameConversation(id),
			togglePin: () => this.togglePinConversationList(),
		});
		await this.renderConversationList();
	}

	async renderConversationList(): Promise<void> {
		await this.listView?.render();
	}

	/**
	 * Load or create initial conversation
	 */
	async loadOrCreateConversation(): Promise<void> {
		const storage = this.storage;
		// Try to load active conversation
		if (this.plugin.settings.activeConversationId) {
			const conv = await storage.loadConversation(this.plugin.settings.activeConversationId);
			if (conv) {
				this.loadConversation(conv);
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
		const storage = this.storage;
		// Always start new conversations from default chat settings
		const defaultConfig = this.buildDefaultConversationConfig();
		const newConv: Conversation = {
			id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			title: t('chat.newConversation'),
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			mode: this.plugin.settings.defaultChatMode ?? 'agent',
			config: defaultConfig
		};

		// Save to storage service
		await storage.createConversation(newConv);
		
		this.plugin.settings.activeConversationId = newConv.id;
		await this.plugin.saveSettings();

		this.loadConversation(newConv);
		void this.renderConversationList();

		// Close conversation list after creating new conversation (only if not pinned)
		if (!this.state.conversationListPinned) {
			this.state.conversationListVisible = false;
			this.conversationListContainer.removeClass('is-open');
			this.conversationListContainer.addClass('is-collapsed');
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
		const mode = conv.mode ?? this.state.mode;
		if (conv.config) {
			if (typeof conv.config.temperature === 'number') {
				this.state.temperature = conv.config.temperature;
			}
			if (typeof conv.config.maxTokens === 'number') {
				this.state.maxTokens = conv.config.maxTokens;
			}
			if (typeof conv.config.topP === 'number') {
				this.state.topP = conv.config.topP;
			}
			if (typeof conv.config.frequencyPenalty === 'number') {
				this.state.frequencyPenalty = conv.config.frequencyPenalty;
			}
			if (typeof conv.config.presencePenalty === 'number') {
				this.state.presencePenalty = conv.config.presencePenalty;
			}
			if (mode !== 'agent' && typeof conv.config.ragEnabled === 'boolean') {
				this.state.enableRAG = conv.config.ragEnabled;
			}
			if (mode !== 'agent' && typeof conv.config.webSearchEnabled === 'boolean') {
				this.state.enableWebSearch = conv.config.webSearchEnabled;
			}
		}
		this.plugin.settings.activeConversationId = conv.id;

		// Re-render messages (with agent chain grouping)
		this.chatContainer.empty();
		this.renderMessageList(this.state.messages);

		// Update token summary after loading conversation
		this.updateTokenSummary();

		// Update the model selector to reflect the model used in the conversation
		// Find the most recently used model in the conversation (from assistant messages)
		const configuredModel = conv.config?.modelId;
		const lastModelUsed = this.getLastUsedModel(conv);
		const targetModel = configuredModel || lastModelUsed;
		if (targetModel && this.modelSelect.querySelector(`option[value="${targetModel}"]`)) {
			this.modelSelect.value = targetModel;
		}

		void this.renderConversationList();
		this.trigger('conversation-loaded', conv);
	}

	/**
	 * Get the token usage summary for the current conversation
	 */
	public getTokenSummary(): { prompt: number; completion: number; total: number } {
		let prompt = 0;
		let completion = 0;
		let total = 0;

		for (const message of this.state.messages) {
			if (message.role === 'assistant' && message.tokenUsage) {
				prompt += message.tokenUsage.promptTokens || 0;
				completion += message.tokenUsage.completionTokens || 0;
				total += message.tokenUsage.totalTokens || 0;
			}
		}

		return { prompt, completion, total };
	}

	/**
	 * Switch to a different conversation
	 */
	async switchConversation(convId: string): Promise<void> {

		// If clicking on the same conversation, just close the list
		if (this.state.currentConversationId === convId) {
			// Close conversation list (only if not pinned)
			if (!this.state.conversationListPinned) {
				this.state.conversationListVisible = false;
				this.conversationListContainer.removeClass('is-open');
				this.conversationListContainer.addClass('is-collapsed');
			}
			return;
		}

		// Save current conversation before switching (skip re-render to avoid double render)
		await this.saveCurrentConversation(true);

		const storage = this.storage;
		const conv = await storage.loadConversation(convId);
		if (conv) {
			this.loadConversation(conv);
			await this.plugin.saveSettings();
			// Close conversation list after switching (only if not pinned)
			if (!this.state.conversationListPinned) {
				this.state.conversationListVisible = false;
				this.conversationListContainer.removeClass('is-open');
				this.conversationListContainer.addClass('is-collapsed');
			}
		}
	}

	/**
	 * Save the current conversation
	 */
	async saveCurrentConversation(skipRender: boolean = false): Promise<void> {
		if (!this.state.currentConversationId) return;
		const storage = this.storage;

		// Get the existing conversation to preserve metadata
		let existingConv = await storage.loadConversation(this.state.currentConversationId);
		
		if (!existingConv) {
			// If conversation doesn't exist, create a new one
			existingConv = {
				id: this.state.currentConversationId,
				title: t('chat.newConversation'),
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
		}

		const conv = { ...existingConv }; // Create a copy

		// Save all messages without filtering
		conv.messages = [...this.state.messages];
		conv.updatedAt = Date.now();
		conv.mode = this.state.mode;
		conv.config = this.buildCurrentConversationConfig();

		const titleBefore = existingConv.title;

		// Auto-generate/update title based on settings (only once for new conversations)
		const shouldUpdateTitle = this.shouldUpdateConversationTitle(conv);
		if (shouldUpdateTitle) {
			const newTitle = await this.namer.title(this.state.messages, this.modelSelect.value);
			if (newTitle) {
				conv.title = newTitle;
				if (this.plugin.settings.conversationIconEnabled && !conv.icon) {
					const newIcon = await this.namer.icon(newTitle, this.modelSelect.value);
					if (newIcon) {
						conv.icon = newIcon;
					}
				}
			}
		}

		// Save the updated conversation to storage
		await storage.updateConversation(conv);

		// Only re-render when title changed — regular message saves don't need a full list rebuild
		if (!skipRender && conv.title !== titleBefore) {
			void this.renderConversationList();
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
			topP: this.state.topP,
			frequencyPenalty: this.state.frequencyPenalty,
			presencePenalty: this.state.presencePenalty,
			ragEnabled: this.state.enableRAG,
			webSearchEnabled: this.state.enableWebSearch
		};
	}

	private buildDefaultConversationConfig(): Conversation['config'] {
		// Prefer the configured default model; fall back to current selection if unset
		const defaultModel = this.plugin.settings.defaultModel || this.modelSelect?.value || undefined;
		return {
			modelId: defaultModel || undefined,
			promptId: null,
			agentId: null,
			temperature: 0.7,
			maxTokens: 4000,
			topP: 1.0,
			frequencyPenalty: 0,
			presencePenalty: 0,
			ragEnabled: false,
			webSearchEnabled: false
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
		const storage = this.storage;
		const conv = await storage.getConversationMetadata(convId);
		if (!conv) return;

		const wasVisible = this.state.conversationListVisible;

		if (!await showConfirm(this.app, `Delete conversation "${conv.title}"?`)) {
			this.restoreListVisibility(wasVisible);
			return;
		}

		const deleted = await storage.deleteConversation(convId);
		if (!deleted) {
			this.restoreListVisibility(wasVisible);
			return;
		}

		// If deleting current conversation, switch to another or create new
		if (convId === this.state.currentConversationId) {
			const allConversationsMetadata = await storage.getAllConversationsMetadata();
			if (allConversationsMetadata.length > 0) {
				const sortedConversations = allConversationsMetadata.sort((a, b) => b.updatedAt - a.updatedAt);
				const mostRecentConv = await storage.loadConversation(sortedConversations[0].id);
				if (mostRecentConv) {
					this.loadConversation(mostRecentConv);
				}
			} else {
				await this.createNewConversation();
				return; // createNewConversation already handles list re-render
			}
		}

		this.restoreListVisibility(wasVisible);
		void this.renderConversationList();
		this.trigger('conversation-deleted', convId);
	}

	/**
	 * Rename a conversation
	 */
	async renameConversation(convId: string): Promise<void> {
		const storage = this.storage;
		const conv = await storage.getConversationMetadata(convId);
		if (!conv) return;

		const wasVisible = this.state.conversationListVisible;

		const newTitle = await showPrompt(this.app, 'Enter new title:', conv.title);
		if (newTitle && newTitle.trim()) {
			const success = await storage.renameConversation(convId, newTitle.trim());
			if (success) {
				this.restoreListVisibility(wasVisible);
				void this.renderConversationList();

				const updatedMetadata = await storage.getConversationMetadata(convId);
				if (updatedMetadata) {
					this.trigger('conversation-updated', {
						id: convId,
						title: updatedMetadata.title,
						messages: this.state.messages
					});
				}
			}
		} else {
			this.restoreListVisibility(wasVisible);
		}
	}

	private restoreListVisibility(wasVisible: boolean): void {
		if (wasVisible && !this.state.conversationListPinned) {
			this.state.conversationListVisible = true;
			this.conversationListContainer.removeClass('is-collapsed');
			this.conversationListContainer.addClass('is-open');
		}
	}

	/**
	 * Toggle conversation list visibility
	 */
	async toggleConversationList(): Promise<void> {
		this.state.conversationListVisible = !this.state.conversationListVisible;
		if (this.state.conversationListVisible) {
			this.conversationListContainer.removeClass('is-collapsed');
			this.conversationListContainer.addClass('is-open');
		} else {
			this.conversationListContainer.removeClass('is-open');
			this.conversationListContainer.addClass('is-collapsed');
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
			this.conversationListContainer.addClass('is-pinned');
			this.state.conversationListVisible = true;
			this.conversationListContainer.removeClass('is-collapsed');
			this.conversationListContainer.addClass('is-open');
		} else {
			this.conversationListContainer.removeClass('is-pinned');
		}
	}

	/**
	 * Check if conversation title should be auto-updated
	 */
	private shouldUpdateConversationTitle(conv: Conversation): boolean {
		// Only generate title once for "New Conversation" with at least 2 messages
		if (conv.title === t('chat.newConversation') && this.state.messages.length >= 2) {
			return true;
		}

		// Never auto-update after initial generation
		return false;
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
}
