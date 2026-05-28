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

		const createIconButton = (icon: string, title: string): HTMLButtonElement => {
			const button = header.createEl('button', { cls: 'chat-header-icon-btn' });
			const iconEl = button.createSpan({ cls: 'chat-header-icon-btn__icon' });
			setIcon(iconEl, icon);
			button.setAttr('title', title);
			return button;
		};

		const historyBtn = createIconButton('list', t('chat.toggleConversationsTitle'));
		historyBtn.setAttribute('data-testid', TestIds.chat.conversationToggleBtn);
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

		const newChatBtn = createIconButton('plus', t('chat.new'));
		newChatBtn.setAttribute('data-testid', TestIds.chat.newBtn);
		newChatBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.callbacks.onNewChat();
		});

		const settingsBtn = createIconButton('settings', t('chat.settings'));
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
