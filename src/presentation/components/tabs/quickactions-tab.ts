/**
 * Quick Actions Settings Tab
 * Displays and manages AI-powered quick actions for editor context menu
 */

import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { QuickActionConfig } from '@/types';
import { t } from '@/i18n';
import { createTable } from '@/presentation/utils/ui-helpers';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { ModelManager } from '@/infrastructure/llm/model-manager';

export function displayQuickActionsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: t('settings.quickActions.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.quickActions.desc')
	});
	desc.addClass('ia-section-description');

	// Prefix configuration
	new Setting(containerEl)
		.setName(t('settings.quickActions.actionPrefix.name'))
		.setDesc(t('settings.quickActions.actionPrefix.desc'))
		.addText(text => text
			.setPlaceholder(t('settings.quickActions.actionPrefix.placeholder'))
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
		text: t('settings.quickActions.count', { count: plugin.settings.quickActions.length, enabled: enabledCount })
	});

	const addBtn = actionsRow.createEl('button', { text: t('settings.quickActions.addBtn') });
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
		emptyDiv.setText(t('settings.quickActions.empty'));
		return;
	}

	const table = createTable(containerEl, [
		t('settings.quickActions.tableHeaders.action'),
		t('settings.quickActions.tableHeaders.type'),
		t('settings.quickActions.tableHeaders.model'),
		t('settings.quickActions.tableHeaders.promptPreview'),
		t('settings.quickActions.tableHeaders.actions')
	]);
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

			const titleContainer = actionStack.createDiv('ia-action-title-row');

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
			const builtInNameKey = `settings.quickActions.builtIn.${action.id}.name`;
			const displayName = t(builtInNameKey, { defaultValue: action.name });
			titleEl.setText(displayName);

			// Type column
			const typeCell = row.insertCell();
			typeCell.addClass('ia-table-cell');
			const typeBadges = typeCell.createDiv('ia-table-badges');
			const typeLabel = t(`settings.quickActions.edit.actionType.${action.actionType}`, { defaultValue: action.actionType });
			const typeBadge = typeBadges.createEl('span', { text: typeLabel });
			typeBadge.addClass('ia-tag');

			// Model column
			const modelCell = row.insertCell();
			modelCell.addClass('ia-table-cell');
			const modelStack = modelCell.createDiv('ia-table-stack');
			const modelName = action.model
				? (modelMap.get(action.model) || action.model)
				: t('settings.quickActions.defaultModel');
			modelStack.createDiv('ia-table-title').setText(modelName);

			// Prompt preview column
			const promptCell = row.insertCell();
			promptCell.addClass('ia-table-cell');
			const builtInPromptKey = `settings.quickActions.builtIn.${action.id}.prompt`;
			const displayPrompt = t(builtInPromptKey, { defaultValue: action.prompt });
			const promptPreview = displayPrompt.length > 60
				? displayPrompt.substring(0, 60) + '...'
				: displayPrompt;
			promptCell.createDiv('ia-table-subtext').setText(promptPreview);

			// Actions column
			const actionsCell = row.insertCell();
			actionsCell.addClass('ia-table-cell');
			actionsCell.addClass('ia-table-actions');

			// Edit button
			const editBtn = actionsCell.createEl('button', { text: t('settings.quickActions.editBtn') });
			editBtn.addClass('ia-button');
			editBtn.addClass('ia-button--ghost');
			editBtn.addEventListener('click', () => {
				void openQuickActionEditModal(plugin, app, action, i, refreshDisplay);
			});

			// Delete button
			const deleteBtn = actionsCell.createEl('button', { text: t('settings.quickActions.deleteBtn') });
			deleteBtn.addClass('ia-button');
			deleteBtn.addClass('ia-button--danger');
			deleteBtn.addEventListener('click', () => {
				void (async () => {
						const confirmed = await showConfirm(
							app,
							t('settings.quickActions.confirm.delete', { name: action.name })
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

	infoEl.createEl('h4', { text: t('settings.quickActions.usageInfo.title') });
	const usageList = infoEl.createEl('ul');
	usageList.createEl('li', { text: t('settings.quickActions.usageInfo.step1') });
	usageList.createEl('li', { text: t('settings.quickActions.usageInfo.step2') });
	usageList.createEl('li', { text: t('settings.quickActions.usageInfo.step3') });
	usageList.createEl('li', { text: t('settings.quickActions.usageInfo.step4Replace') });
	usageList.createEl('li', { text: t('settings.quickActions.usageInfo.step4Explain') });
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

			contentEl.createEl('h2', { text: t('settings.quickActions.edit.title') });

			// Name
			new Setting(contentEl)
				.setName(t('settings.quickActions.edit.name.name'))
				.setDesc(t('settings.quickActions.edit.name.desc'))
				.addText(text => text
					.setValue(this.action.name)
					.setPlaceholder('e.g., Make text longer')
					.onChange(value => {
						this.action.name = value;
					})
				);

			// Action Type
			new Setting(contentEl)
				.setName(t('settings.quickActions.edit.actionType.name'))
				.setDesc(t('settings.quickActions.edit.actionType.desc'))
				.addDropdown(dropdown => dropdown
					.addOption('replace', t('settings.quickActions.edit.actionType.replace'))
					.addOption('explain', t('settings.quickActions.edit.actionType.explain'))
					.setValue(this.action.actionType)
					.onChange(value => {
						this.action.actionType = value as 'replace' | 'explain';
					})
				);

			// Model
			void ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs).then(models => {
				new Setting(contentEl)
					.setName(t('settings.quickActions.edit.model.name'))
					.setDesc(t('settings.quickActions.edit.model.desc'))
					.addDropdown(dropdown => {
						dropdown.addOption('', t('settings.quickActions.edit.model.default'));
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
				.setName(t('settings.quickActions.edit.promptTemplate.name'))
				.setDesc(t('settings.quickActions.edit.promptTemplate.desc'))
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
			buttonContainer.addClass('ia-modal-footer');

			new ButtonComponent(buttonContainer)
				.setButtonText(t('settings.quickActions.edit.cancel'))
				.onClick(() => {
					this.close();
				});

			new ButtonComponent(buttonContainer)
				.setButtonText(t('settings.quickActions.edit.save'))
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
