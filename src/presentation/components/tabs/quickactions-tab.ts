/**
 * Quick Actions Settings Tab
 * Displays and manages AI-powered quick actions for editor context menu
 */

import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { QuickActionConfig } from '@/types';
import { createTable } from '@/presentation/utils/ui-helpers';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { ModelManager } from '@/infrastructure/llm/model-manager';

export function displayQuickActionsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'Quick actions' });

	const desc = containerEl.createEl('p', {
		text: 'Configure AI-powered quick actions that appear in the editor context menu when text is selected.'
	});
	desc.addClass('ia-section-description');

	// Prefix configuration
	new Setting(containerEl)
		.setName('Action prefix')
		.setDesc('Prefix (emoji or text) to display before all quick actions in the context menu')
		.addText(text => text
			.setPlaceholder('⚡')
			.setValue(plugin.settings.quickActionPrefix || '⚡')
			.onChange(async (value) => {
				plugin.settings.quickActionPrefix = value || '⚡';
				await plugin.saveSettings();
			}));

	// Add new quick action button
	const actionsRow = containerEl.createDiv('ia-section-actions');
	const summary = actionsRow.createDiv('ia-section-summary');
	const enabledCount = plugin.settings.quickActions.filter(a => a.enabled).length;
	summary.createSpan({
		text: `${plugin.settings.quickActions.length} action${plugin.settings.quickActions.length === 1 ? '' : 's'} configured (${enabledCount} enabled)`
	});

	const addBtn = actionsRow.createEl('button', { text: '+ add quick action' });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		const newAction: QuickActionConfig = {
			id: `action-${Date.now()}`,
			name: 'New Quick Action',
			enabled: true,
			prompt: 'Process the following text:\n\n',
			actionType: 'replace'
		};
		plugin.settings.quickActions.push(newAction);
		void plugin.saveSettings();
		refreshDisplay();
	});

	// Display existing quick actions in a table
	if (plugin.settings.quickActions.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No quick actions configured. Select add quick action to get started.');
		return;
	}

	const table = createTable(containerEl, ['Action', 'Type', 'Model', 'Prompt Preview', 'Actions']);
	const tbody = table.tBodies[0];

	// Get available models for display
	void ModelManager.getAllAvailableModels(plugin.settings.llmConfigs).then(models => {
		const modelMap = new Map(models.map(m => [m.id, m.name]));

		for (let i = 0; i < plugin.settings.quickActions.length; i++) {
			const action = plugin.settings.quickActions[i];
			const row = tbody.insertRow();
			row.addClass('ia-table-row');

			// Action column with enable/disable toggle
			const actionCell = row.insertCell();
			actionCell.addClass('ia-table-cell');
			const actionStack = actionCell.createDiv('ia-table-stack');

			const titleContainer = actionStack.createDiv();
			titleContainer.setCssProps({ 'display': 'flex', 'align-items': 'center', 'gap': '8px' });

			const enableToggle = titleContainer.createEl('input', { type: 'checkbox' });
			enableToggle.checked = action.enabled;
			enableToggle.addEventListener('change', () => {
				void (async () => {
					plugin.settings.quickActions[i].enabled = enableToggle.checked;
					await plugin.saveSettings();
					refreshDisplay();
				})();
			});

			const titleEl = titleContainer.createDiv('ia-table-title');
			titleEl.setText(action.name);

			// Type column
			const typeCell = row.insertCell();
			typeCell.addClass('ia-table-cell');
			const typeBadges = typeCell.createDiv('ia-table-badges');
			const typeBadge = typeBadges.createEl('span', { text: action.actionType });
			typeBadge.addClass('ia-tag');

			// Model column
			const modelCell = row.insertCell();
			modelCell.addClass('ia-table-cell');
			const modelStack = modelCell.createDiv('ia-table-stack');
			const modelName = action.model
				? (modelMap.get(action.model) || action.model)
				: 'Default';
			modelStack.createDiv('ia-table-title').setText(modelName);

			// Prompt preview column
			const promptCell = row.insertCell();
			promptCell.addClass('ia-table-cell');
			const promptPreview = action.prompt.length > 60
				? action.prompt.substring(0, 60) + '...'
				: action.prompt;
			promptCell.createDiv('ia-table-subtext').setText(promptPreview);

			// Actions column
			const actionsCell = row.insertCell();
			actionsCell.addClass('ia-table-cell');
			actionsCell.addClass('ia-table-actions');

			// Edit button
			const editBtn = actionsCell.createEl('button', { text: 'Edit' });
			editBtn.addClass('ia-button');
			editBtn.addClass('ia-button--ghost');
			editBtn.addEventListener('click', () => {
				void openQuickActionEditModal(plugin, app, action, i, refreshDisplay);
			});

			// Delete button
			const deleteBtn = actionsCell.createEl('button', { text: 'delete' });
			deleteBtn.addClass('ia-button');
			deleteBtn.addClass('ia-button--danger');
			deleteBtn.addEventListener('click', () => {
				void (async () => {
					const confirmed = await showConfirm(
						app,
						'Delete quick action',
						`Are you sure you want to delete "${action.name}"?`,
						'delete'
					);
					if (confirmed) {
						plugin.settings.quickActions.splice(i, 1);
						await plugin.saveSettings();
						refreshDisplay();
					}
				})();
			});
		}
	});

	// Usage info
	const infoEl = containerEl.createDiv('ia-info-box');
	infoEl.setCssProps({ 'margin-top': '20px' });

	infoEl.createEl('h4', { text: 'Usage' });
	const usageList = infoEl.createEl('ul');
	usageList.createEl('li', { text: 'Select text in any note' });
	usageList.createEl('li', { text: 'Right-click to open context menu' });
	usageList.createEl('li', { text: 'Choose a quick action from the menu' });
	usageList.createEl('li', { text: 'Actions marked as "replace" will replace the selected text with the AI result' });
	usageList.createEl('li', { text: 'Actions marked as "explain" will show the result in a modal dialog' });
}

/**
 * Open modal to edit a quick action
 */
function openQuickActionEditModal(
	plugin: IntelligenceAssistantPlugin,
	app: App,
	action: QuickActionConfig,
	index: number,
	refreshDisplay: () => void
): void {
	class QuickActionEditModal extends Modal {
		constructor(
			app: App,
			private plugin: IntelligenceAssistantPlugin,
			private action: QuickActionConfig,
			private index: number,
			private refreshDisplay: () => void
		) {
			super(app);
		}

		onOpen(): void {
			const { contentEl } = this;
			contentEl.empty();

			contentEl.createEl('h2', { text: 'Edit quick action' });

			// Name
			new Setting(contentEl)
				.setName('Name')
				.setDesc('Display name for this action in the context menu')
				.addText(text => text
					.setValue(this.action.name)
					.setPlaceholder('e.g., Make text longer')
					.onChange(value => {
						this.action.name = value;
					})
				);

			// Action Type
			new Setting(contentEl)
				.setName('Action type')
				.setDesc('How the AI response should be handled')
				.addDropdown(dropdown => dropdown
					.addOption('replace', 'Replace selected text')
					.addOption('explain', 'Show in modal')
					.setValue(this.action.actionType)
					.onChange(value => {
						this.action.actionType = value as 'replace' | 'explain';
					})
				);

			// Model
			void ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs).then(models => {
				new Setting(contentEl)
					.setName('Model')
					.setDesc('Language model to use for this action (leave blank to use default)')
					.addDropdown(dropdown => {
						dropdown.addOption('', 'Use default model');
						models.forEach(model => {
							dropdown.addOption(model.id, model.name);
						});
						dropdown.setValue(this.action.model || '');
						dropdown.onChange(value => {
							this.action.model = value || undefined;
						});
					});
			});

			// Prompt
			new Setting(contentEl)
				.setName('Prompt template')
				.setDesc('Instructions sent to the AI. The selected text will be appended automatically.')
				.addTextArea(text => {
					text.setValue(this.action.prompt);
					text.setPlaceholder('e.g., Expand and elaborate on the following text...');
					text.inputEl.rows = 6;
					text.onChange(value => {
						this.action.prompt = value;
					});
				});

			// Buttons
			const buttonContainer = contentEl.createDiv();
			buttonContainer.setCssProps({ 'margin-top': '16px' });

			new ButtonComponent(buttonContainer)
				.setButtonText('Cancel')
				.onClick(() => {
					this.close();
				});

			new ButtonComponent(buttonContainer)
				.setButtonText('Save')
				.setCta()
				.onClick(() => {
					void (async () => {
						this.plugin.settings.quickActions[this.index] = this.action;
						await this.plugin.saveSettings();
						this.refreshDisplay();
						this.close();
					})();
				});
		}

		onClose(): void {
			const { contentEl } = this;
			contentEl.empty();
		}
	}

	const modal = new QuickActionEditModal(app, plugin, { ...action }, index, refreshDisplay);
	modal.open();
}
