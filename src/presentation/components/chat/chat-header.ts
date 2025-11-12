/**
 * Chat Header Component
 * Renders the top header bar with model selector, actions, and status indicators
 */

import { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { createButton, createControlContainer, createLabel, createBadge } from '../utils/dom-helpers';

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
	header.style.display = 'flex';
	header.style.gap = '12px';
	header.style.padding = '12px';
	header.style.borderBottom = '1px solid var(--background-modifier-border)';
	header.style.background = 'var(--background-secondary)';
	header.style.alignItems = 'center';

	// Toggle conversation list button
	createButton(header, {
		text: '☰',
		title: 'Toggle Conversations',
		styles: { size: 'md', variant: 'ghost' },
		onClick: (e) => {
			e.stopPropagation();
			options.onToggleConversations();
		}
	});

	// Model selector container
	const modelContainer = header.createDiv('model-selector');
	modelContainer.style.display = 'flex';
	modelContainer.style.alignItems = 'center';
	modelContainer.style.gap = '8px';
	modelContainer.style.flex = '1';

	// Model label
	const modelLabel = modelContainer.createSpan({ text: '🤖 Model:' });
	modelLabel.style.fontWeight = '500';
	modelLabel.style.fontSize = '13px';

	// Model select dropdown
	const modelSelect = modelContainer.createEl('select');
	modelSelect.style.flex = '1';
	modelSelect.style.padding = '6px 10px';
	modelSelect.style.borderRadius = '4px';
	modelSelect.style.border = '1px solid var(--background-modifier-border)';
	modelSelect.style.background = 'var(--background-primary)';
	modelSelect.style.color = 'var(--text-normal)';
	modelSelect.style.fontSize = '13px';
	modelSelect.style.cursor = 'pointer';
	modelSelect.addEventListener('change', () => options.onModelChange());

	// Actions container
	const modelActions = header.createDiv();
	modelActions.style.display = 'flex';
	modelActions.style.gap = '6px';

	// Model count info badge
	const modelCountEl = header.createSpan();
	modelCountEl.style.fontSize = '11px';
	modelCountEl.style.color = 'var(--text-muted)';
	modelCountEl.style.padding = '4px 8px';
	modelCountEl.style.background = 'var(--background-primary)';
	modelCountEl.style.borderRadius = '4px';
	modelCountEl.setText('Loading...');

	// Token usage summary badge
	const tokenSummaryEl = header.createSpan();
	tokenSummaryEl.style.fontSize = '11px';
	tokenSummaryEl.style.color = 'var(--text-muted)';
	tokenSummaryEl.style.padding = '4px 8px';
	tokenSummaryEl.style.background = 'var(--background-primary)';
	tokenSummaryEl.style.borderRadius = '4px';
	tokenSummaryEl.style.marginLeft = '8px';
	tokenSummaryEl.setText('Tokens: 0');
	tokenSummaryEl.title = 'Total tokens used in this conversation';

	// New chat button
	createButton(modelActions, {
		text: '➕ New',
		title: 'New Chat',
		styles: { size: 'md', variant: 'ghost' },
		onClick: () => options.onNewChat()
	});

	// Settings button
	createButton(modelActions, {
		text: '⚙️',
		title: 'Open Settings',
		styles: { size: 'md', variant: 'ghost' },
		onClick: () => {
			// Open plugin settings
			// @ts-ignore - app.setting is available
			app.setting.open();
			// @ts-ignore - app.setting is available
			app.setting.openTabById('intelligence-assistant');
		}
	});

	return {
		modelSelect,
		modelCountEl,
		tokenSummaryEl
	};
}
