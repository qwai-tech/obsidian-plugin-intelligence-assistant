/**
 * General Settings Tab
 * Displays general plugin settings
 */

import { Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n';

export function displayGeneralTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: t('settings.general.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.general.desc')
	});
	desc.addClass('ia-section-description', 'ia-section-description--spaced');
	// Plugin Version
	new Setting(containerEl)
		.setName(t('settings.general.pluginVersion.name'))
		.setDesc(t('settings.general.pluginVersion.desc'))
		.addText(text => text
			.setValue(plugin.manifest.version)
			.setDisabled(true));

	// Default Model
	new Setting(containerEl)
		.setName(t('settings.general.defaultModel.name'))
		.setDesc(t('settings.general.defaultModel.desc'))
		.addText(text => text
			.setPlaceholder(t('settings.general.defaultModel.placeholder'))
			.setValue(plugin.settings.defaultModel)
			.onChange(async (value) => {
				plugin.settings.defaultModel = value;
				await plugin.saveSettings();
			}));

	// Default Chat Mode
	new Setting(containerEl)
		.setName(t('settings.general.defaultChatMode.name'))
		.setDesc(t('settings.general.defaultChatMode.desc'))
		.addDropdown(dropdown => dropdown
			.addOption('Chat', t('settings.general.defaultChatMode.chat'))
			.addOption('Agent', t('settings.general.defaultChatMode.agent'))
			.setValue(plugin.settings.defaultChatMode ?? 'chat')
			.onChange(async (value) => {
				plugin.settings.defaultChatMode = (value as 'chat' | 'agent');
				await plugin.saveSettings();
			}));

	// Conversation Title Mode
	new Setting(containerEl)
		.setName(t('settings.general.conversationTitleMode.name'))
		.setDesc(t('settings.general.conversationTitleMode.desc'))
		.addDropdown(dropdown => dropdown
			.addOption('first-message', t('settings.general.conversationTitleMode.firstMessage'))
			.addOption('auto-summary', t('settings.general.conversationTitleMode.autoSummary'))
			.addOption('manual', t('settings.general.conversationTitleMode.manual'))
			.setValue(plugin.settings.conversationTitleMode)
			.onChange(async (value) => {
				plugin.settings.conversationTitleMode = value;
				await plugin.saveSettings();
			}));

	// Conversation Icon
	new Setting(containerEl)
		.setName(t('settings.general.conversationIcons.name'))
		.setDesc(t('settings.general.conversationIcons.desc'))
		.addToggle(toggle => toggle
			.setValue(plugin.settings.conversationIconEnabled)
			.onChange(async (value) => {
				plugin.settings.conversationIconEnabled = value;
				await plugin.saveSettings();
			}));

	// Configuration Status
	// Get conversation count from storage service instead of settings array
	void plugin.getConversationStorageService().then(storageService => {
		void storageService.getConversationCount().then(conversationCount => {
			const statusValue = plugin.settings.llmConfigs.length > 0 && plugin.settings.defaultModel
				? t('settings.general.configStatus.ok', { providers: plugin.settings.llmConfigs.length, conversations: conversationCount })
				: t('settings.general.configStatus.incomplete');

			new Setting(containerEl)
				.setName(t('settings.general.configStatus.name'))
				.setDesc(t('settings.general.configStatus.desc'))
				.addText(text => text
					.setValue(statusValue)
					.setDisabled(true));
		});
	});
}
