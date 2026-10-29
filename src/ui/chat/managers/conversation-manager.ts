import { App, Events } from 'obsidian';
import { t } from '@/i18n';
import { showConfirm } from '@/ui/modals/confirm-modal';
import { showPrompt } from '@/ui/modals/prompt-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Conversation, Message } from '@/features/conversations/types/conversation';
import { ChatViewState } from '@/ui/state/chat-view-state';
import type { ConversationNamer } from '@/features/chat/conversation-namer';
import { agentModelId } from '@/features/chat/chat-session-policy';
import { ConversationListView } from '@/ui/chat/conversation-list-view';
import { applyConversationSettings } from '@/ui/chat/conversation-settings';
import type { ConversationStorageService } from '@/adapters/persistence/conversation-storage-service';

const NEW_CONVERSATION_CONFIG = {
	promptId: null,
	agentId: null,
	temperature: 0.7,
	maxTokens: 4000,
	topP: 1.0,
	frequencyPenalty: 0,
	presencePenalty: 0,
	ragEnabled: false,
	webSearchEnabled: false,
};

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

	async loadOrCreateConversation(): Promise<void> {
		const activeId = this.plugin.settings.activeConversationId;
		const conversation = (activeId ? await this.storage.loadConversation(activeId) : null) ?? await this.loadMostRecent();
		if (conversation) {
			this.loadConversation(conversation);
		} else {
			await this.createNewConversation();
		}
	}

	async createNewConversation(): Promise<void> {
		const conversation: Conversation = {
			id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			title: t('chat.newConversation'),
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			mode: this.plugin.settings.defaultChatMode ?? 'agent',
			config: { ...NEW_CONVERSATION_CONFIG, modelId: this.plugin.settings.defaultModel || this.modelSelect?.value || undefined },
		};
		await this.storage.createConversation(conversation);
		await this.plugin.updateSettings((settings) => {
			settings.activeConversationId = conversation.id;
		});

		this.loadConversation(conversation);
		void this.renderConversationList();
		this.closeListUnlessPinned();
		this.trigger('conversation-created', conversation);
	}

	loadConversation(conv: Conversation): void {
		this.state.currentConversationId = conv.id;
		this.state.messages = conv.messages;
		if (conv.mode) {
			this.state.mode = conv.mode;
		}
		if (conv.config) {
			applyConversationSettings(this.state, conv.config, conv.mode ?? this.state.mode);
		}
		this.plugin.settings.activeConversationId = conv.id;

		this.chatContainer.empty();
		this.renderMessageList(this.state.messages);
		this.updateTokenSummary();

		const targetModel = conv.config?.modelId || lastUsedModel(conv);
		if (targetModel && this.modelSelect.querySelector(`option[value="${targetModel}"]`)) {
			this.modelSelect.value = targetModel;
		}

		void this.renderConversationList();
		this.trigger('conversation-loaded', conv);
	}

	async switchConversation(convId: string): Promise<void> {
		if (this.state.currentConversationId === convId) {
			this.closeListUnlessPinned();
			return;
		}
		await this.saveCurrentConversation(true);
		const conv = await this.storage.loadConversation(convId);
		if (conv) {
			this.loadConversation(conv);
			await this.plugin.saveSettings();
			this.closeListUnlessPinned();
		}
	}

	async saveCurrentConversation(skipRender: boolean = false): Promise<void> {
		if (!this.state.currentConversationId) return;
		const existing = await this.storage.loadConversation(this.state.currentConversationId) ?? {
			id: this.state.currentConversationId,
			title: t('chat.newConversation'),
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		const conv: Conversation = {
			...existing,
			messages: [...this.state.messages],
			updatedAt: Date.now(),
			mode: this.state.mode,
			config: this.currentConfig(),
		};

		if (conv.title === t('chat.newConversation') && this.state.messages.length >= 2) {
			await this.nameConversation(conv);
		}
		await this.storage.updateConversation(conv);

		if (!skipRender && conv.title !== existing.title) {
			void this.renderConversationList();
		}
		this.trigger('conversation-updated', conv);
	}

	async deleteConversation(convId: string): Promise<void> {
		const conv = await this.storage.getConversationMetadata(convId);
		if (!conv) return;
		const wasVisible = this.state.conversationListVisible;

		if (!await showConfirm(this.app, `Delete conversation "${conv.title}"?`) || !await this.storage.deleteConversation(convId)) {
			this.restoreListVisibility(wasVisible);
			return;
		}

		if (convId === this.state.currentConversationId) {
			const mostRecent = await this.loadMostRecent();
			if (!mostRecent) {
				await this.createNewConversation();
				return;
			}
			this.loadConversation(mostRecent);
		}

		this.restoreListVisibility(wasVisible);
		void this.renderConversationList();
		this.trigger('conversation-deleted', convId);
	}

	async renameConversation(convId: string): Promise<void> {
		const conv = await this.storage.getConversationMetadata(convId);
		if (!conv) return;
		const wasVisible = this.state.conversationListVisible;

		const newTitle = (await showPrompt(this.app, 'Enter new title:', conv.title))?.trim();
		if (!newTitle) {
			this.restoreListVisibility(wasVisible);
			return;
		}
		if (await this.storage.renameConversation(convId, newTitle)) {
			this.restoreListVisibility(wasVisible);
			void this.renderConversationList();
			const updated = await this.storage.getConversationMetadata(convId);
			if (updated) {
				this.trigger('conversation-updated', { id: convId, title: updated.title, messages: this.state.messages });
			}
		}
	}

	async toggleConversationList(): Promise<void> {
		this.setListOpen(!this.state.conversationListVisible);
		await this.renderConversationList();
		this.trigger('list-toggled', this.state.conversationListVisible);
	}

	async togglePinConversationList(): Promise<void> {
		this.state.conversationListPinned = !this.state.conversationListPinned;
		this.conversationListContainer.toggleClass('is-pinned', this.state.conversationListPinned);
		if (this.state.conversationListPinned) {
			this.setListOpen(true);
		}
		await this.renderConversationList();
	}

	private async loadMostRecent(): Promise<Conversation | null> {
		const metadata = await this.storage.getAllConversationsMetadata();
		if (metadata.length === 0) return null;
		const [latest] = metadata.sort((a, b) => b.updatedAt - a.updatedAt);
		return this.storage.loadConversation(latest.id);
	}

	private async nameConversation(conv: Conversation): Promise<void> {
		const title = await this.namer.title(this.state.messages, this.modelSelect.value);
		if (!title) return;
		conv.title = title;
		if (this.plugin.settings.conversationIconEnabled && !conv.icon) {
			conv.icon = await this.namer.icon(title, this.modelSelect.value) || conv.icon;
		}
	}

	private currentConfig(): Conversation['config'] {
		const { mode, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, enableRAG, enableWebSearch } = this.state;
		return {
			modelId: this.currentModelId(),
			promptId: mode === 'chat' ? (this.plugin.settings.activeSystemPromptId ?? null) : null,
			agentId: mode === 'agent' ? (this.plugin.settings.activeAgentId ?? null) : null,
			temperature,
			maxTokens,
			topP,
			frequencyPenalty,
			presencePenalty,
			ragEnabled: enableRAG,
			webSearchEnabled: enableWebSearch,
		};
	}

	private currentModelId(): string | undefined {
		const selected = this.modelSelect?.value?.trim() ?? '';
		const defaultModel = this.plugin.settings.defaultModel || '';
		const agentId = this.state.mode === 'agent' ? this.plugin.settings.activeAgentId : null;
		const agent = agentId ? this.plugin.settings.agents.find(candidate => candidate.id === agentId) : null;
		return (agent ? agentModelId(agent, selected, defaultModel) || selected : selected || defaultModel) || undefined;
	}

	private closeListUnlessPinned(): void {
		if (!this.state.conversationListPinned) {
			this.setListOpen(false);
		}
	}

	private restoreListVisibility(wasVisible: boolean): void {
		if (wasVisible && !this.state.conversationListPinned) {
			this.setListOpen(true);
		}
	}

	private setListOpen(open: boolean): void {
		this.state.conversationListVisible = open;
		this.conversationListContainer.toggleClass('is-open', open);
		this.conversationListContainer.toggleClass('is-collapsed', !open);
	}
}

function lastUsedModel(conv: Conversation): string | null {
	return [...conv.messages].reverse().find(message => message.role === 'assistant' && message.model)?.model ?? null;
}
