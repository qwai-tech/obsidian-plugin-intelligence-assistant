import { setIcon, type App } from 'obsidian';
import { t } from '@/i18n';
import type { PluginHost } from '@/ui/plugin-host';
import type { Message } from '@/features/conversations';
import type { ChatViewState } from '@/ui/state/chat-view-state';
import { TestIds } from '@/ui/utils/test-ids';
import { renderMessage, type MessageRendererCallbacks } from './message-renderer';
import { groupAgentChains } from './message-grouping';

const BODY_SELECTORS = ['[data-message-body]', '.ia-chat-message__body', '.message-body'];
const CONTENT_SELECTORS = ['[data-message-content]', '.ia-chat-message__content', '.message-content'];

export class ChatMessageList {
	readonly element: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly app: App,
		private readonly plugin: PluginHost,
		private readonly state: ChatViewState,
		private readonly callbacks: MessageRendererCallbacks,
	) {
		this.element = parent.createDiv('chat-messages');
		this.element.setAttribute('data-testid', TestIds.chat.messageList);
	}

	render(messages: Message[]): void {
		for (const message of groupAgentChains(messages)) {
			this.add(message);
		}
		if (messages.length === 0) {
			this.showEmptyState();
		}
	}

	add(message: Message): HTMLElement {
		this.removeEmptyState();
		const context = { app: this.app, plugin: this.plugin, mode: this.state.mode, messages: this.state.messages };
		return renderMessage(this.element, message, context, this.callbacks, { animate: true });
	}

	showPreflight(title: string, items: string[]): void {
		this.removeEmptyState();
		const card = this.element.createDiv('ia-agent-preflight-card');
		card.createDiv({ cls: 'ia-agent-preflight-card__eyebrow', text: 'Agent task preflight' });
		card.createDiv({ cls: 'ia-agent-preflight-card__title', text: title });
		const list = card.createDiv('ia-agent-preflight-card__items');
		for (const item of items) {
			list.createSpan({ cls: 'ia-agent-preflight-card__item', text: item });
		}
		this.scrollToEnd();
	}

	scrollToEnd(): void {
		this.element.scrollTo({ top: this.element.scrollHeight, behavior: 'smooth' });
	}

	bodyOf(messageEl: HTMLElement): HTMLElement | null {
		return firstMatch(messageEl, BODY_SELECTORS);
	}

	contentOf(messageEl: HTMLElement): HTMLElement | null {
		return firstMatch(messageEl, CONTENT_SELECTORS);
	}

	private showEmptyState(): void {
		if (this.element.querySelector('.ia-chat-message') || this.element.querySelector('.ia-chat-empty-state')) {
			return;
		}
		const empty = this.element.createDiv('ia-chat-empty-state');
		empty.setAttribute('data-testid', TestIds.chat.emptyState);
		setIcon(empty.createDiv('ia-chat-empty-state__icon'), 'message-square');
		empty.createEl('h3', { text: t('chat.emptyHeading'), cls: 'ia-chat-empty-state__heading' });
		empty.createEl('p', { text: t('chat.emptySubtext'), cls: 'ia-chat-empty-state__subtext' });
	}

	private removeEmptyState(): void {
		this.element.querySelector('.ia-chat-empty-state')?.remove();
	}
}

function firstMatch(root: HTMLElement, selectors: string[]): HTMLElement | null {
	for (const selector of selectors) {
		const element = root.querySelector(selector);
		if (element instanceof HTMLElement) {
			return element;
		}
	}
	return null;
}
