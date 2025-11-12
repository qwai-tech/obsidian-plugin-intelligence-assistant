/**
 * Prompts Settings Tab
 * Displays system prompt management
 */

import { Notice, App } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { SystemPrompt } from '@/types';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { SystemPromptEditModal } from '../modals';

export function displayPromptsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'System Prompts' });

	const desc = containerEl.createEl('p', {
		text: 'Manage system prompts that define the behavior and personality of your AI assistant.'
	});
	desc.addClass('ia-section-description');
	desc.addClass('ia-section-description--spaced');

	// Actions row
	const actionRow = containerEl.createDiv('ia-section-actions');
	actionRow.addClass('ia-section-actions--wrap');

	// Add new prompt button
	const addBtn = actionRow.createEl('button', { text: '+ Add System Prompt' });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		plugin.settings.systemPrompts.push({
			id: `prompt-${Date.now()}`,
			name: 'New Prompt',
			content: 'You are a helpful assistant.',
			enabled: true,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		plugin.saveSettings();
		refreshDisplay();
	});

	// Display existing prompts in a table if they exist
	if (plugin.settings.systemPrompts.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No system prompts configured. Click "Add System Prompt" to get started.');
		return;
	}

	const table = createTable(containerEl, ['Name', 'Content Preview', 'Created', 'Updated', 'Enabled', 'Actions']);
	const tbody = table.tBodies[0];

	plugin.settings.systemPrompts.forEach((prompt, index) => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		// Name column
		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameStack = nameCell.createDiv('ia-table-stack');
		nameStack.createDiv('ia-table-title').setText(prompt.name);
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
		createStatusIndicator(statusHost, prompt.enabled ? 'success' : 'warning', prompt.enabled ? 'Enabled' : 'Disabled');

		// Actions column
		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		// Edit button (opens modal for full content review)
		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			// Create a modal for editing the prompt content
			new SystemPromptEditModal(app, prompt, async (updatedPrompt) => {
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
		const toggleBtn = actionsCell.createEl('button', { text: prompt.enabled ? 'Disable' : 'Enable' });
		toggleBtn.addClass('ia-button');
		toggleBtn.addClass('ia-button--ghost');
		toggleBtn.addEventListener('click', async () => {
			prompt.enabled = !prompt.enabled;
			prompt.updatedAt = Date.now();
			await plugin.saveSettings();
			refreshDisplay();
		});

		// Delete button
		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', async () => {
			if (confirm(`Delete prompt "${prompt.name}"?`)) {
				plugin.settings.systemPrompts.splice(index, 1);
				await plugin.saveSettings();
				refreshDisplay();
			}
		});
	});
}

