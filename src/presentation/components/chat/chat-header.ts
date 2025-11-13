/**
 * Chat Header Component
 * Renders the top header bar with model selector, actions, and status indicators
 */

import { App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import {createButton} from '../utils/dom-helpers';

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
	header.setCssProps({ 'gap': '12px' });
	header.setCssProps({ 'padding': '12px' });
	header.setCssProps({ 'border-bottom': '1px solid var(--background-modifier-border)' });
	header.setCssProps({ 'background': 'var(--background-secondary)' });
	header.setCssProps({ 'align-items': 'center' });

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
	modelContainer.removeClass('ia-hidden');
	modelContainer.setCssProps({ 'align-items': 'center' });
	modelContainer.setCssProps({ 'gap': '8px' });
	modelContainer.setCssProps({ 'flex': '1' });

	// Model label
	const modelLabel = modelContainer.createSpan({ text: '🤖 Model:' });
	modelLabel.setCssProps({ 'font-weight': '500' });
	modelLabel.setCssProps({ 'font-size': '13px' });

	// Model select dropdown
	const modelSelect = modelContainer.createEl('select');
	modelSelect.setCssProps({ 'flex': '1' });
	modelSelect.setCssProps({ 'padding': '6px 10px' });
	modelSelect.setCssProps({ 'border-radius': '4px' });
	modelSelect.setCssProps({ 'border': '1px solid var(--background-modifier-border)' });
	modelSelect.setCssProps({ 'background': 'var(--background-primary)' });
	modelSelect.setCssProps({ 'color': 'var(--text-normal)' });
	modelSelect.setCssProps({ 'font-size': '13px' });
	modelSelect.addClass('ia-clickable');
	modelSelect.addEventListener('change', () => options.onModelChange());

	// Actions container
	const modelActions = header.createDiv();
	modelActions.removeClass('ia-hidden');
	modelActions.setCssProps({ 'gap': '6px' });

	// Model count info badge
	const modelCountEl = header.createSpan();
	modelCountEl.setCssProps({ 'font-size': '11px' });
	modelCountEl.setCssProps({ 'color': 'var(--text-muted)' });
	modelCountEl.setCssProps({ 'padding': '4px 8px' });
	modelCountEl.setCssProps({ 'background': 'var(--background-primary)' });
	modelCountEl.setCssProps({ 'border-radius': '4px' });
	modelCountEl.setText('Loading...');

	// Token usage summary badge
	const tokenSummaryEl = header.createSpan();
	tokenSummaryEl.setCssProps({ 'font-size': '11px' });
	tokenSummaryEl.setCssProps({ 'color': 'var(--text-muted)' });
	tokenSummaryEl.setCssProps({ 'padding': '4px 8px' });
	tokenSummaryEl.setCssProps({ 'background': 'var(--background-primary)' });
	tokenSummaryEl.setCssProps({ 'border-radius': '4px' });
	tokenSummaryEl.setCssProps({ 'margin-left': '8px' });
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
