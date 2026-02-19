/**
 * Conversation Manager
 * Handles conversation lifecycle, UI rendering, and persistence
 */

import {App, Menu, setIcon} from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { showPrompt } from '@/presentation/components/modals/prompt-modal';
import { Events } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Conversation, Message } from '@/types';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ConversationStorageService } from '@/application/services/conversation-storage-service';
import { CLI_PROVIDER_LABELS } from '@/types/core/cli-agent';

/**
 * Events emitted by ConversationManager
 */
export interface ConversationManagerEvents {
	'conversation-loaded': (_conversation: Conversation) => void;
	'conversation-created': (_conversation: Conversation) => void;
	'conversation-updated': (_conversation: Conversation) => void;
	'conversation-deleted': (_conversationId: string) => void;
	'list-toggled': (_visible: boolean) => void;
}

export class ConversationManager extends Events {
	private conversationListContainer: HTMLElement;
	private storageService: ConversationStorageService | null = null;
	private storageReadyPromise: Promise<void> | null = null;
	private searchQuery: string = '';

	constructor(
		private app: App,
		private plugin: IntelligenceAssistantPlugin,
		private state: ChatViewState,
		private chatContainer: HTMLElement,
		private modelSelect: HTMLSelectElement,
		private addMessageToUI: (_message: Message) => HTMLElement,
		private renderMessageList: (_messages: Message[]) => void,
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
		await this.ensureStorageReady();
		const storage = this.storageService!;
		// Always start new conversations from default chat settings
		const defaultConfig = this.buildDefaultConversationConfig();
		const newConv: Conversation = {
			id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			title: 'New Conversation',
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			mode: 'chat',
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
		// Restore CLI agent selection from config
		this.state.selectedCliAgentId = conv.config?.cliAgentId ?? null;

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
			if (typeof conv.config.ragEnabled === 'boolean') {
				this.state.enableRAG = conv.config.ragEnabled;
			}
			if (typeof conv.config.webSearchEnabled === 'boolean') {
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
	 * Switch to a different conversation
	 */
	async switchConversation(convId: string): Promise<void> {
		await this.ensureStorageReady();

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

		const storage = this.storageService!;
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

		// Save all messages without filtering
		conv.messages = [...this.state.messages];
		conv.updatedAt = Date.now();
		conv.mode = this.state.mode;
		conv.config = this.buildCurrentConversationConfig();

		// Auto-generate/update title based on settings (only once for new conversations)
		const shouldUpdateTitle = this.shouldUpdateConversationTitle(conv);
		if (shouldUpdateTitle) {
			const newTitle = await this.generateConversationTitle(conv);
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
		await storage.updateConversation(conv);

		// Only re-render if not skipped (e.g., when switching conversations)
		if (!skipRender) {
			void this.renderConversationList();
		}

		this.trigger('conversation-updated', conv);
	}

	private buildCurrentConversationConfig(): Conversation['config'] {
		return {
			modelId: this.getEffectiveModelIdForState(),
			promptId: this.state.mode === 'chat' ? (this.plugin.settings.activeSystemPromptId ?? null) : null,
			agentId: this.state.mode === 'agent' ? (this.plugin.settings.activeAgentId ?? null) : null,
			cliAgentId: this.state.mode === 'agent' ? (this.state.selectedCliAgentId ?? null) : null,
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
			// CLI agents manage their own model — don't store the chat view dropdown value
			if (this.state.selectedCliAgentId) {
				return undefined;
			}
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

		void this.renderConversationList();
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

		const newTitle = await showPrompt(this.app, 'Enter new title:', conv.title);
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
				void this.renderConversationList();
				
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

		// Pin/Unpin button
		const pinBtn = headerButtons.createDiv({ cls: 'clickable-icon pin-conversation-btn' });
		setIcon(pinBtn, this.state.conversationListPinned ? 'pin-off' : 'pin');
		pinBtn.setAttribute('aria-label', this.state.conversationListPinned ? 'Unpin' : 'Pin to sidebar');
		pinBtn.addEventListener('click', () => {
			void this.togglePinConversationList();
		});

		const newConvBtn = headerButtons.createDiv({ cls: 'clickable-icon new-conversation-btn' });
		setIcon(newConvBtn, 'plus');
		newConvBtn.setAttribute('aria-label', 'New conversation');
		newConvBtn.addEventListener('click', () => {
			void this.createNewConversation();
		});

		// Search input
		const searchContainer = this.conversationListContainer.createDiv('conversation-search');
		const searchInput = searchContainer.createEl('input', {
			attr: { type: 'text', placeholder: 'Search conversations...' }
		});
		searchInput.addClass('conversation-search-input');
		searchInput.value = this.searchQuery;
		const searchIconEl = searchContainer.createDiv('conversation-search-icon');
		setIcon(searchIconEl, 'search');

		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value;
			const items = listContent.querySelectorAll('.conversation-item');
			const groups = listContent.querySelectorAll('.conversation-date-group');
			const query = this.searchQuery.toLowerCase();

			items.forEach(item => {
				const title = (item as HTMLElement).querySelector('.conversation-title')?.textContent?.toLowerCase() || '';
				(item as HTMLElement).style.display = title.includes(query) ? '' : 'none';
			});

			// Hide empty date groups
			groups.forEach(group => {
				const visibleItems = (group as HTMLElement).querySelectorAll('.conversation-item:not([style*="display: none"])');
				(group as HTMLElement).style.display = visibleItems.length > 0 ? '' : 'none';
			});
		});

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

		// Group by date
		const groups = this.groupConversationsByDate(sortedConversations);

		for (const group of groups) {
			const groupEl = listContent.createDiv('conversation-date-group');
			groupEl.createDiv({ text: group.label, cls: 'conversation-date-label' });

			group.conversations.forEach(conv => {
			const convItem = groupEl.createDiv('conversation-item');
			convItem.addClass('ia-clickable');

			if (conv.id === this.state.currentConversationId) {
				convItem.addClass('active');
			}

			// Single click on item to switch conversation
			convItem.addEventListener('click', (e) => {
				// Don't switch if clicking on action buttons
				const target = e.target as HTMLElement;
				if (target.closest('.conversation-actions') || target.closest('button')) {
					return;
				}
				e.stopPropagation();
				void this.switchConversation(conv.id);
			});

			const convContent = convItem.createDiv('conversation-content');

			const convTitle = convContent.createDiv('conversation-title');

			// Add icon if enabled and available
			if (this.plugin.settings.conversationIconEnabled && conv.icon) {
				const icon = convTitle.createSpan('conversation-icon');
				icon.setText(conv.icon + ' ');
			}

			convTitle.createSpan().setText(conv.title);

			// Mode & model/agent info line
			const convInfo = convContent.createDiv('conversation-info');
			const isCliAgent = !!conv.cliAgentId;
			const isAgent = conv.mode === 'agent' && !isCliAgent;

			const modeBadge = convInfo.createSpan('conversation-info__mode');
			if (isCliAgent) {
				modeBadge.setText('CLI Agent');
				modeBadge.addClass('is-cli-agent');
			} else if (isAgent) {
				modeBadge.setText('Agent');
				modeBadge.addClass('is-agent');
			} else {
				modeBadge.setText('Chat');
				modeBadge.addClass('is-chat');
			}

			if (isCliAgent) {
				const agentInfo = this.resolveConversationAgentInfo(conv);
				if (agentInfo) {
					convInfo.createSpan('conversation-info__sep').setText('|');
					convInfo.createSpan('conversation-info__agent').setText(agentInfo.name);
					if (agentInfo.providerLabel) {
						convInfo.createSpan('conversation-info__sep').setText('|');
						convInfo.createSpan('conversation-info__provider').setText(agentInfo.providerLabel);
					}
				}
			} else if (isAgent) {
				const agentInfo = this.resolveConversationAgentInfo(conv);
				if (agentInfo) {
					convInfo.createSpan('conversation-info__sep').setText('|');
					convInfo.createSpan('conversation-info__agent').setText(agentInfo.name);
				}
				if (conv.model) {
					convInfo.createSpan('conversation-info__sep').setText('|');
					convInfo.createSpan('conversation-info__model').setText(conv.model);
				}
			} else if (conv.model) {
				convInfo.createSpan('conversation-info__sep').setText('|');
				convInfo.createSpan('conversation-info__model').setText(conv.model);
			}

			// Add timestamps below title
			const convMeta = convContent.createDiv('conversation-meta');

			const formatDate = (timestamp: number) => {
				const date = new Date(timestamp);
				return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
					' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
			};

			convMeta.setText(`${formatDate(conv.createdAt)} | ${formatDate(conv.updatedAt)}`);

			// Actions container (hover visibility handled by CSS)
			const actions = convItem.createDiv('conversation-actions');

			// Delete button
			const deleteBtn = actions.createEl('button');
			deleteBtn.addClass('conversation-delete-btn');
			deleteBtn.addClass('ia-clickable');
			setIcon(deleteBtn, 'trash-2');
			deleteBtn.title = 'Delete';
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.deleteConversation(conv.id);
			});

			// Context menu for additional options
			convItem.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();

				menu.addItem((item) => {
					item.setTitle('Delete')
						.setIcon('trash')
						.onClick(() => {
							void this.deleteConversation(conv.id);
						});
				});

				menu.showAtMouseEvent(e);
			});
		});
		}
	}

	/** Resolve agent name and provider label for a conversation metadata entry */
	private resolveConversationAgentInfo(conv: { agentId?: string; cliAgentId?: string }): { name: string; providerLabel?: string } | null {
		if (conv.cliAgentId) {
			const cliAgent = (this.plugin.settings.cliAgents ?? []).find(a => a.id === conv.cliAgentId);
			if (!cliAgent) return null;
			const cliProvider = (this.plugin.settings.cliProviders ?? []).find(p => p.id === cliAgent.providerId);
			const providerLabel = cliProvider
				? CLI_PROVIDER_LABELS[cliProvider.provider] ?? cliProvider.provider
				: undefined;
			return { name: cliAgent.name, providerLabel };
		}
		if (conv.agentId) {
			const agent = (this.plugin.settings.agents ?? []).find(a => a.id === conv.agentId);
			return agent ? { name: agent.name } : null;
		}
		return null;
	}

	/**
	 * Group conversations by date categories
	 */
	private groupConversationsByDate(conversations: Array<{ id: string; title: string; createdAt: number; updatedAt: number; icon?: string; model?: string; mode?: string; agentId?: string; cliAgentId?: string }>): Array<{ label: string; conversations: typeof conversations }> {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const yesterdayStart = todayStart - 86400000;
		const weekStart = todayStart - (now.getDay() * 86400000);

		const groups: Record<string, typeof conversations> = {
			'Today': [],
			'Yesterday': [],
			'This week': [],
			'Older': []
		};

		for (const conv of conversations) {
			if (conv.updatedAt >= todayStart) {
				groups['Today'].push(conv);
			} else if (conv.updatedAt >= yesterdayStart) {
				groups['Yesterday'].push(conv);
			} else if (conv.updatedAt >= weekStart) {
				groups['This week'].push(conv);
			} else {
				groups['Older'].push(conv);
			}
		}

		return Object.entries(groups)
			.filter(([, convs]) => convs.length > 0)
			.map(([label, convs]) => ({ label, conversations: convs }));
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
	private async generateConversationTitle(_conv: Conversation): Promise<string | null> {
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
