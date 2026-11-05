/**
 * Prompts Settings Tab
 * Displays system prompt management
 */

import {App} from 'obsidian';
import { showConfirm } from '@/ui/modals/confirm-modal';
import type { PluginHost } from '@/ui/plugin-host';
import { t } from '@/i18n';
import { TestIds } from '@/ui/utils/test-ids';
import { SystemPromptEditModal } from '@/ui/modals/system-prompt-edit-modal';
import { renderListRow, tagButton } from '@/ui/settings/list-row';

export function displayPromptsTab(
	containerEl: HTMLElement,
	plugin: PluginHost,
	app: App,
	refreshDisplay: () => void
): void {

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
		const draft = {
			id: `prompt-${Date.now()}`,
			name: 'New prompt',
			content: 'You are a helpful assistant.',
			enabled: true,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		new SystemPromptEditModal(app, draft, async (created) => {
			await plugin.updateSettings(settings => {
				settings.systemPrompts.push(created);
			});
			refreshDisplay();
		}).open();
	});

	// Display existing prompts in a table if they exist
	if (plugin.settings.systemPrompts.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.prompts.empty'));
		return;
	}

	for (const prompt of plugin.settings.systemPrompts) {
		const preview = prompt.content.length > 120 ? `${prompt.content.substring(0, 120)}…` : prompt.content;
		const row = renderListRow(containerEl, {
			name: prompt.name,
			lines: [preview],
			testId: TestIds.settings.promptRow,
			attributes: { 'data-prompt-id': prompt.id, 'data-prompt-name': prompt.name },
		});

		row.addToggle(toggle => {
			tagButton(toggle.toggleEl as HTMLButtonElement, TestIds.settings.promptToggleBtn, { 'data-prompt-id': prompt.id });
			toggle.setTooltip(prompt.enabled ? t('settings.prompts.actions.disable') : t('settings.prompts.actions.enable'));
			toggle.setValue(prompt.enabled).onChange(async (enabled) => {
				await plugin.updateSettings(() => {
					prompt.enabled = enabled;
					prompt.updatedAt = Date.now();
				});
				refreshDisplay();
			});
		});

		row.addButton(button => {
			button.setButtonText(t('settings.prompts.actions.edit'));
			tagButton(button.buttonEl, TestIds.settings.promptEditBtn, { 'data-prompt-id': prompt.id });
			button.onClick(() => {
				new SystemPromptEditModal(app, prompt, async (updatedPrompt) => {
					if (prompt.readonly) return;
					await plugin.updateSettings((settings) => {
						settings.systemPrompts = settings.systemPrompts.map(candidate => candidate.id === updatedPrompt.id ? updatedPrompt : candidate);
					});
					refreshDisplay();
				}).open();
			});
		});

		if (!prompt.readonly) {
			row.addButton(button => {
				button.setButtonText(t('settings.prompts.actions.delete')).setDestructive();
				tagButton(button.buttonEl, TestIds.settings.promptDeleteBtn, { 'data-prompt-id': prompt.id });
				button.onClick(async () => {
					if (await showConfirm(app, t('settings.prompts.confirm.delete', { name: prompt.name }), { title: t('ux.deletePrompt'), confirmText: t('settings.prompts.actions.delete') })) {
						await plugin.updateSettings((settings) => {
							settings.systemPrompts = settings.systemPrompts.filter(candidate => candidate.id !== prompt.id);
						});
						refreshDisplay();
					}
				});
			});
		}
	}
}
