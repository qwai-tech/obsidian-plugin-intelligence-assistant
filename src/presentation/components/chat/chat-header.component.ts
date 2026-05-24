import { setIcon } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { hasSettings } from '@/utils/type-guards';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { t } from '@/i18n';
import { TestIds } from '@/presentation/utils/test-ids';

export interface ChatHeaderCallbacks {
	onToggleConversations: () => Promise<void>;
	onNewChat: () => Promise<void>;
}

export class ChatHeaderComponent {
	public conversationTitleEl: HTMLElement;
	private agentHeaderBadgeEl: HTMLElement;

	constructor(
		private parent: HTMLElement,
		private plugin: IntelligenceAssistantPlugin,
		private state: ChatViewState,
		private callbacks: ChatHeaderCallbacks
	) {
		this.render();
	}

	private render() {
		const header = this.parent.createDiv('chat-header-simple');

		const historyBtn = header.createEl('button', { cls: 'chat-header-icon-btn' });
		setIcon(historyBtn, 'list');
		historyBtn.setAttr('title', t('chat.toggleConversationsTitle'));
		historyBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.callbacks.onToggleConversations();
		});

		this.conversationTitleEl = header.createEl('span', {
			text: t('chat.currentConversation'),
			cls: 'chat-header-title'
		});

		this.agentHeaderBadgeEl = header.createEl('span', { cls: 'chat-agent-header-badge ia-hidden' });

		const newChatBtn = header.createEl('button', { cls: 'chat-header-icon-btn' });
		newChatBtn.setAttribute('data-testid', TestIds.chat.newBtn);
		setIcon(newChatBtn, 'plus');
		newChatBtn.setAttr('title', t('chat.new'));
		newChatBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.callbacks.onNewChat();
		});

		const settingsBtn = header.createEl('button', { cls: 'chat-header-icon-btn' });
		setIcon(settingsBtn, 'settings');
		settingsBtn.setAttr('title', t('chat.settings'));
		settingsBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (hasSettings(this.plugin.app)) {
				this.plugin.app.setting.open();
				this.plugin.app.setting.openTabById('intelligence-assistant');
			}
		});
	}

	public updateConversationTitle(title: string) {
		if (this.conversationTitleEl) {
			this.conversationTitleEl.setText(title || t('chat.currentConversation'));
		}
	}

	public updateAgentBadge(name: string | null) {
		if (!this.agentHeaderBadgeEl) return;
		if (name) {
			this.agentHeaderBadgeEl.setText(`🤖 ${name}`);
			this.agentHeaderBadgeEl.removeClass('ia-hidden');
		} else {
			this.agentHeaderBadgeEl.addClass('ia-hidden');
		}
	}
}
