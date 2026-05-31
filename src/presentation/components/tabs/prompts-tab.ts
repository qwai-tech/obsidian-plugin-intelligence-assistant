/**
 * Prompts Settings Tab
 * Displays system prompt management
 */

import {App} from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { TestIds } from '@/presentation/utils/test-ids';
import { SystemPromptEditModal } from '../modals';

export function displayPromptsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: t('settings.prompts.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.prompts.desc')
	});
	desc.addClass('ia-section-description');
	desc.addClass('ia-section-description--spaced');

	// Actions row
	const actionRow = containerEl.createDiv('ia-section-actions');
	actionRow.addClass('ia-section-actions--wrap');

	// Add new prompt button
	const addBtn = actionRow.createEl('button', { text: t('settings.prompts.addBtn') });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.setAttribute('data-testid', TestIds.settings.promptAddBtn);
	addBtn.addEventListener('click', () => {
		plugin.settings.systemPrompts.push({
			id: `prompt-${Date.now()}`,
			name: 'New Prompt',
			content: 'You are a helpful assistant.',
			enabled: true,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		void plugin.saveSettings();
		refreshDisplay();
	});

	// Display existing prompts in a table if they exist
	if (plugin.settings.systemPrompts.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.prompts.empty'));
		return;
	}

	const table = createTable(containerEl, [
		t('settings.prompts.tableHeaders.name'),
		t('settings.prompts.tableHeaders.contentPreview'),
		t('settings.prompts.tableHeaders.created'),
		t('settings.prompts.tableHeaders.updated'),
		t('settings.prompts.tableHeaders.enabled'),
		t('settings.prompts.tableHeaders.actions')
	]);
	const tbody = table.tBodies[0];

	plugin.settings.systemPrompts.forEach((prompt, index) => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');
		row.setAttribute('data-testid', TestIds.settings.promptRow);
		row.setAttribute('data-prompt-id', prompt.id);
		row.setAttribute('data-prompt-name', prompt.name);

		// Name column
		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameStack = nameCell.createDiv('ia-table-stack');
		const nameRow = nameStack.createDiv('ia-table-title-row');
		nameRow.createDiv('ia-table-title').setText(prompt.name);
		if (prompt.readonly) {
			nameRow.createSpan('ia-badge ia-badge--info').setText('Built-in');
		}
		if (prompt.id) {
			nameStack.createDiv('ia-table-subtext').setText(prompt.id);
		}

		// Content Preview column
		const contentCell = row.insertCell();
		contentCell.addClass('ia-table-cell');
		contentCell.addClass('ia-table-subtext');
		const previewText = prompt.content.length > 100
			? prompt.content.substring(0, 100) + '...'
			: prompt.content;
		contentCell.setText(previewText);

		// Created column
		const createdCell = row.insertCell();
		createdCell.addClass('ia-table-cell');
		createdCell.setText(new Date(prompt.createdAt).toLocaleDateString());

		// Updated column
		const updatedCell = row.insertCell();
		updatedCell.addClass('ia-table-cell');
		updatedCell.setText(new Date(prompt.updatedAt).toLocaleDateString());

		// Enabled column
		const enabledCell = row.insertCell();
		enabledCell.addClass('ia-table-cell');
		enabledCell.addClass('ia-table-cell--center');
		const statusHost = enabledCell.createDiv();
		createStatusIndicator(statusHost, prompt.enabled ? 'success' : 'warning', prompt.enabled ? t('settings.prompts.status.enabled') : t('settings.prompts.status.disabled'));

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		// Edit button (opens modal for full content review)
		const editBtn = actionsCell.createEl('button', { text: prompt.readonly ? 'View' : t('settings.prompts.actions.edit') });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.setAttribute('data-testid', TestIds.settings.promptEditBtn);
		editBtn.setAttribute('data-prompt-id', prompt.id);
		editBtn.addEventListener('click', () => {
			// Create a modal for viewing/editing the prompt content
			new SystemPromptEditModal(app, prompt, async (updatedPrompt) => {
				if (prompt.readonly) return;
				// Find and update the prompt in settings
				const promptIndex = plugin.settings.systemPrompts.findIndex(p => p.id === updatedPrompt.id);
				if (promptIndex !== -1) {
					plugin.settings.systemPrompts[promptIndex] = updatedPrompt;
					await plugin.saveSettings();
					refreshDisplay();
				}
			}).open();
		});

		// Enable or disable prompt
		const toggleBtn = actionsCell.createEl('button', { text: prompt.enabled ? t('settings.prompts.actions.disable') : t('settings.prompts.actions.enable') });
		toggleBtn.addClass('ia-button');
		toggleBtn.addClass('ia-button--ghost');
		toggleBtn.setAttribute('data-testid', TestIds.settings.promptToggleBtn);
		toggleBtn.setAttribute('data-prompt-id', prompt.id);
		toggleBtn.addEventListener('click', () => {
			void (async () => {
				prompt.enabled = !prompt.enabled;
				prompt.updatedAt = Date.now();
				await plugin.saveSettings();
				refreshDisplay();
			})();
		});

		// Delete button
		if (!prompt.readonly) {
			const deleteBtn = actionsCell.createEl('button', { text: t('settings.prompts.actions.delete') });
			deleteBtn.addClass('ia-button');
			deleteBtn.addClass('ia-button--danger');
			deleteBtn.setAttribute('data-testid', TestIds.settings.promptDeleteBtn);
			deleteBtn.setAttribute('data-prompt-id', prompt.id);
			deleteBtn.addEventListener('click', () => {
				void (async () => {
					if (await showConfirm(app, t('settings.prompts.confirm.delete', { name: prompt.name }))) {
						plugin.settings.systemPrompts.splice(index, 1);
						await plugin.saveSettings();
						refreshDisplay();
					}
				})();
			});
		}
	});
}
