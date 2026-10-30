/**
 * Quick Actions Settings Tab
 * Displays and manages AI-powered quick actions for editor context menu
 */

import { App, ButtonComponent, DropdownComponent, Modal, Setting } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import type { QuickActionConfig } from '@/features/settings';
import { t } from '@/i18n';
import { showConfirm } from '@/ui/modals/confirm-modal';
import { ModelManager } from '@qwai/obsidian-llm';
import { TestIds } from '@/ui/utils/test-ids';
import { renderListRow, tagButton } from '@/ui/settings/list-row';

export function displayQuickActionsTab(
	containerEl: HTMLElement,
	plugin: PluginHost,
	app: App,
	refreshDisplay: () => void
): void {

	const desc = containerEl.createEl('p', {
		text: t('settings.quickActions.desc')
	});
	desc.addClass('ia-section-description');

	// Prefix configuration
	new Setting(containerEl)
		.setName(t('settings.quickActions.actionPrefix.name'))
		.setDesc(t('settings.quickActions.actionPrefix.desc'))
		.addText(text => {
			text.inputEl.setAttribute('data-testid', TestIds.settings.quickActionPrefixInput);
			text.setPlaceholder(t('settings.quickActions.actionPrefix.placeholder'))
				.setValue(plugin.settings.quickActionPrefix || '⚡')
				.onChange(async (value) => {
					await plugin.updateSettings((settings) => {
						settings.quickActionPrefix = value || '⚡';
					});
				});
		});

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
	addBtn.setAttribute('data-testid', TestIds.settings.quickActionAddBtn);
	addBtn.addEventListener('click', () => {
		const newAction: QuickActionConfig = {
			id: `action-${Date.now()}`,
			name: 'New Quick Action',
			enabled: true,
			prompt: 'Process the following text:\n\n',
			actionType: 'replace'
		};
		void plugin.updateSettings((settings) => {
			settings.quickActions.push(newAction);
		});
		refreshDisplay();
	});

	// Display existing quick actions in a table
	if (plugin.settings.quickActions.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.quickActions.empty'));
		return;
	}

	plugin.settings.quickActions.forEach((action, index) => {
		const displayPrompt = t(`settings.quickActions.builtIn.${action.id}.prompt`, { defaultValue: action.prompt });
		const row = renderListRow(containerEl, {
			name: t(`settings.quickActions.builtIn.${action.id}.name`, { defaultValue: action.name }),
			badges: [t(`settings.quickActions.edit.actionType.${action.actionType}`, { defaultValue: action.actionType })],
			lines: [
				action.model || t('settings.quickActions.defaultModel'),
				displayPrompt.length > 120 ? `${displayPrompt.substring(0, 120)}…` : displayPrompt,
			],
			testId: TestIds.settings.quickActionRow,
			attributes: { 'data-action-id': action.id, 'data-action-name': action.name },
		});

		row.addToggle(toggle => {
			tagButton(toggle.toggleEl as HTMLButtonElement, TestIds.settings.quickActionToggle, { 'data-action-id': action.id });
			toggle.setValue(action.enabled).onChange(async (enabled) => {
				await plugin.updateSettings((settings) => {
					settings.quickActions[index].enabled = enabled;
				});
				refreshDisplay();
			});
		});

		row.addButton(button => {
			button.setButtonText(t('settings.quickActions.editBtn'));
			tagButton(button.buttonEl, TestIds.settings.quickActionEditBtn, { 'data-action-id': action.id });
			button.onClick(() => openQuickActionEditModal(plugin, app, action, index, refreshDisplay));
		});

		row.addButton(button => {
			button.setButtonText(t('settings.quickActions.deleteBtn')).setDestructive();
			tagButton(button.buttonEl, TestIds.settings.quickActionDeleteBtn, { 'data-action-id': action.id });
			button.onClick(async () => {
				if (await showConfirm(app, t('settings.quickActions.confirm.delete', { name: action.name }))) {
					await plugin.updateSettings((settings) => {
						settings.quickActions = settings.quickActions.filter(candidate => candidate.id !== action.id);
					});
					refreshDisplay();
				}
			});
		});
	});

	// Usage info
	const infoEl = containerEl.createDiv('ia-info-box');

	infoEl.createDiv({ cls: 'ia-info-box__title', text: t('settings.quickActions.usageInfo.title') });
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
	plugin: PluginHost,
	app: App,
	action: QuickActionConfig,
	index: number,
	refreshDisplay: () => void
): void {
	class QuickActionEditModal extends Modal {
		constructor(
			app: App,
			private plugin: PluginHost,
			private action: QuickActionConfig,
			private index: number,
			private refreshDisplay: () => void
		) {
			super(app);
		}

		onOpen(): void {
			const { contentEl } = this;
			contentEl.empty();

			this.setTitle(t('settings.quickActions.edit.title'));

			// Name
			new Setting(contentEl)
				.setName(t('settings.quickActions.edit.name.name'))
				.setDesc(t('settings.quickActions.edit.name.desc'))
				.addText(text => {
					text.inputEl.setAttribute('data-testid', TestIds.settings.quickActionModalNameInput);
					text.setValue(this.action.name)
						.setPlaceholder('Make text longer')
						.onChange(value => {
							this.action.name = value;
						});
				});

			// Action Type
			new Setting(contentEl)
				.setName(t('settings.quickActions.edit.actionType.name'))
				.setDesc(t('settings.quickActions.edit.actionType.desc'))
				.addDropdown(dropdown => {
					dropdown.selectEl.setAttribute('data-testid', TestIds.settings.quickActionModalTypeSelect);
					dropdown.addOption('replace', t('settings.quickActions.edit.actionType.replace'))
						.addOption('explain', t('settings.quickActions.edit.actionType.explain'))
						.setValue(this.action.actionType)
						.onChange(value => {
							this.action.actionType = value as 'replace' | 'explain';
						});
				});

			// Model
			new Setting(contentEl)
				.setName(t('settings.quickActions.edit.model.name'))
				.setDesc(t('settings.quickActions.edit.model.desc'))
				.addDropdown(dropdown => {
					dropdown.selectEl.setAttribute('data-testid', TestIds.settings.quickActionModalModelSelect);
					dropdown.addOption('', t('settings.quickActions.edit.model.default'))
						.setValue(this.action.model || '')
						.onChange(value => {
							this.action.model = value || undefined;
						});
					void this.addModelOptions(dropdown);
				});

			// Prompt
			new Setting(contentEl)
				.setName(t('settings.quickActions.edit.promptTemplate.name'))
				.setDesc(t('settings.quickActions.edit.promptTemplate.desc'))
				.addTextArea(text => {
					text.inputEl.setAttribute('data-testid', TestIds.settings.quickActionModalPromptInput);
					text.setValue(this.action.prompt);
					text.setPlaceholder('Expand and elaborate on the following text...');
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
				})
				.buttonEl.setAttribute('data-testid', TestIds.settings.quickActionModalCancelBtn);

			new ButtonComponent(buttonContainer)
				.setButtonText(t('settings.quickActions.edit.save'))
				.setCta()
				.onClick(() => {
					void (async () => {
						await this.plugin.updateSettings((settings) => {
							settings.quickActions[this.index] = this.action;
						});
						this.refreshDisplay();
						this.close();
					})();
				})
				.buttonEl.setAttribute('data-testid', TestIds.settings.quickActionModalSaveBtn);
		}

		onClose(): void {
			const { contentEl } = this;
			contentEl.empty();
		}

		private async addModelOptions(dropdown: DropdownComponent): Promise<void> {
			const models = await ModelManager.getAllAvailableModels(this.plugin.settings.llmConfigs);
			for (const model of models) {
				dropdown.addOption(model.id, model.name);
			}
			dropdown.setValue(this.action.model || '');
		}
	}

	const modal = new QuickActionEditModal(app, plugin, { ...action }, index, refreshDisplay);
	modal.open();
}
