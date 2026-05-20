/**
 * Chat Header Component
 * Renders the top header bar with model selector, actions, and status indicators
 */

import { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import {createButton} from '../utils/dom-helpers';
import { t } from '@/i18n';

export interface ChatHeaderElements {
	modelSelect: HTMLSelectElement;
	modelCountEl: HTMLElement;
	tokenSummaryEl: HTMLElement;
}

export interface ChatHeaderOptions {
	onToggleConversations: () => void;
	onModelChange: () => void;
	onNewChat: () => void;
}

/**
 * Creates the chat header with all controls and indicators
 */
export function createChatHeader(
	parent: HTMLElement,
	app: App,
	plugin: IntelligenceAssistantPlugin,
	options: ChatHeaderOptions
): ChatHeaderElements {
	const header = parent.createDiv('chat-header');
	header.removeClass('ia-hidden');

	// Toggle conversation list button
	createButton(header, {
		text: '☰',
		title: t('chat.toggleConversationsTitle'),
		styles: { size: 'md', variant: 'ghost' },
		onClick: (e) => {
			e.stopPropagation();
			options.onToggleConversations();
		}
	});

	// Model selector container
	const modelContainer = header.createDiv('model-selector');
	modelContainer.removeClass('ia-hidden');

	// Model label
	const modelLabel = modelContainer.createSpan({ text: '🤖 model:' });
	modelLabel.addClass('ia-model-label');

	// Model select dropdown
	const modelSelect = modelContainer.createEl('select');
	modelSelect.addClass('ia-clickable');
	modelSelect.addEventListener('change', () => options.onModelChange());

	// Actions container
	const modelActions = header.createDiv('ia-model-actions');
	modelActions.removeClass('ia-hidden');

	// Model count info badge
	const modelCountEl = header.createSpan();
	modelCountEl.addClass('ia-badge');
	modelCountEl.setText('Loading...');

	// Token usage summary badge
	const tokenSummaryEl = header.createSpan();
	tokenSummaryEl.addClass('ia-badge');
	tokenSummaryEl.addClass('ia-badge--ml');
	tokenSummaryEl.setText('Tokens: 0');
	tokenSummaryEl.title = 'Total tokens used in this conversation';

	// New chat button
	createButton(modelActions, {
		text: '➕ new',
		title: t('chat.newChat'),
		styles: { size: 'md', variant: 'ghost' },
		onClick: () => options.onNewChat()
	});

	// Settings button
	createButton(modelActions, {
		text: '⚙️',
		title: t('chat.openSettingsTitle'),
		styles: { size: 'md', variant: 'ghost' },
		onClick: () => {
			// Open plugin settings with proper type checking
			const appWithSetting = app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } };
			if (appWithSetting.setting && typeof appWithSetting.setting.open === 'function') {
				appWithSetting.setting.open();
				if (typeof appWithSetting.setting.openTabById === 'function') {
					appWithSetting.setting.openTabById('intelligence-assistant');
				}
			}
		}
	});

	return {
		modelSelect,
		modelCountEl,
		tokenSummaryEl
	};
}
