import { Menu, setIcon } from 'obsidian';
import { t } from '@/i18n';
import type { PluginHost } from '@/ui/plugin-host';
import type { ChatViewState } from '@/ui/state/chat-view-state';
import type { ConversationStorageService } from '@/adapters/persistence/conversation-storage-service';
import { TestIds } from '@/ui/utils/test-ids';

export interface ConversationListActions {
	create(): Promise<void>;
	switchTo(id: string): Promise<void>;
	remove(id: string): Promise<void>;
	rename(id: string): Promise<void>;
	togglePin(): Promise<void>;
}

export class ConversationListView {
	private searchQuery = '';

	constructor(
		private readonly container: HTMLElement,
		private readonly storage: ConversationStorageService,
		private readonly state: ChatViewState,
		private readonly plugin: PluginHost,
		private readonly actions: ConversationListActions,
	) {}

	/**
	 * Render the conversation list UI
	 */
	async render(): Promise<void> {
		const storage = this.storage;
		this.container.empty();

		// Header with new conversation button and pin button
		const listHeader = this.container.createDiv('conversation-list-header');
		listHeader.createEl('h3', { text: t('chat.conversations') });

		const headerButtons = listHeader.createDiv('conversation-header-buttons');

		// Pin/Unpin button
		const pinBtn = headerButtons.createDiv({ cls: 'clickable-icon pin-conversation-btn' });
		setIcon(pinBtn, this.state.conversationListPinned ? 'pin-off' : 'pin');
		pinBtn.setAttribute('aria-label', this.state.conversationListPinned ? 'Unpin' : 'Pin to sidebar');
		pinBtn.addEventListener('click', () => {
			void this.actions.togglePin();
		});

		const newConvBtn = headerButtons.createDiv({ cls: 'clickable-icon new-conversation-btn' });
		setIcon(newConvBtn, 'plus');
		newConvBtn.setAttribute('aria-label', 'New conversation');
		newConvBtn.addEventListener('click', () => {
			void this.actions.create();
		});

		// Search input
		const searchContainer = this.container.createDiv('conversation-search');
		const searchInput = searchContainer.createEl('input', {
			attr: { type: 'text', placeholder: t('chat.searchConversations') }
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
				(item as HTMLElement).toggleClass('ia-hidden', !title.includes(query));
			});

			// Hide empty date groups
			groups.forEach(group => {
				const visibleItems = (group as HTMLElement).querySelectorAll('.conversation-item:not(.ia-hidden)');
				(group as HTMLElement).toggleClass('ia-hidden', visibleItems.length === 0);
			});
		});

		// Conversation list
		const listContent = this.container.createDiv('conversation-list-content');

		// Get all conversations metadata instead of the array from settings
		const conversationsMetadata = await storage.getAllConversationsMetadata();

		if (conversationsMetadata.length === 0) {
			listContent.createDiv('empty-state').setText('No conversations yet');
			return;
		}

		// Sort by updatedAt (most recent first)
		const sortedConversations = conversationsMetadata.sort((a, b) => b.updatedAt - a.updatedAt);

		// Group by date
		const groups = groupByDate(sortedConversations);

		for (const group of groups) {
			const groupEl = listContent.createDiv('conversation-date-group');
			groupEl.createDiv({ text: t(`chat.history.${group.group}`), cls: 'conversation-date-label' });

			group.conversations.forEach(conv => {
			const convItem = groupEl.createDiv('conversation-item');
			convItem.setAttribute('data-testid', TestIds.chat.conversationItem);
			convItem.setAttribute('data-conv-id', conv.id);
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
				void this.actions.switchTo(conv.id);
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
			const isAgent = conv.mode === 'agent';

			const modeBadge = convInfo.createSpan('conversation-info__mode');
			if (isAgent) {
				modeBadge.setText('Agent');
				modeBadge.addClass('is-agent');
			} else {
				modeBadge.setText('Chat');
				modeBadge.addClass('is-chat');
			}

			if (isAgent) {
				const agentInfo = this.agentInfo(conv);
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

			const updated = new Date(conv.updatedAt);
			const time = updated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
			const recent = group.group === 'today' || group.group === 'yesterday';
			convMeta.setText(recent ? time : `${updated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`);

			// Actions container (hover visibility handled by CSS)
			const actions = convItem.createDiv('conversation-actions');

			// Rename button
			const renameBtn = actions.createEl('button');
			renameBtn.addClass('conversation-rename-btn');
			renameBtn.addClass('ia-clickable');
			renameBtn.setAttribute('data-testid', TestIds.chat.conversationRenameBtn);
			renameBtn.setAttribute('data-conv-id', conv.id);
			setIcon(renameBtn, 'pencil');
			renameBtn.title = 'Rename';
			renameBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.actions.rename(conv.id);
			});

			// Delete button
			const deleteBtn = actions.createEl('button');
			deleteBtn.addClass('conversation-delete-btn');
			deleteBtn.addClass('ia-clickable');
			deleteBtn.setAttribute('data-testid', TestIds.chat.conversationDeleteBtn);
			deleteBtn.setAttribute('data-conv-id', conv.id);
			setIcon(deleteBtn, 'trash-2');
			deleteBtn.title = 'Delete';
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.actions.remove(conv.id);
			});

			// Context menu for additional options
			convItem.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();

				menu.addItem((item) => {
					item.setTitle('Rename')
						.setIcon('pencil')
						.onClick(() => {
							void this.actions.rename(conv.id);
						});
				});

				menu.addItem((item) => {
					item.setTitle('Delete')
						.setIcon('trash')
						.onClick(() => {
							void this.actions.remove(conv.id);
						});
				});

				menu.showAtMouseEvent(e);
			});
		});
		}
	}

	/** Resolve agent name for a conversation metadata entry */
	private agentInfo(conv: { agentId?: string }): { name: string } | null {
		if (conv.agentId) {
			const agent = (this.plugin.settings.agents ?? []).find(a => a.id === conv.agentId);
			return agent ? { name: agent.name } : null;
		}
		return null;
	}
}

/**
 * Group conversations by date categories
 */
type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

const DAY_MS = 86_400_000;

export function groupByDate<T extends { updatedAt: number }>(conversations: T[], now = new Date()): Array<{ group: DateGroup; conversations: T[] }> {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const groupOf = (updatedAt: number): DateGroup => {
		if (updatedAt >= todayStart) return 'today';
		if (updatedAt >= todayStart - DAY_MS) return 'yesterday';
		if (updatedAt >= todayStart - now.getDay() * DAY_MS) return 'thisWeek';
		return 'older';
	};
	const order: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'older'];
	return order
		.map(group => ({ group, conversations: conversations.filter(conv => groupOf(conv.updatedAt) === group) }))
		.filter(entry => entry.conversations.length > 0);
}
