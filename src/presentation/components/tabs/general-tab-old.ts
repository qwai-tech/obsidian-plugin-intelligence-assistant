/**
 * General Settings Tab
 * Displays general plugin settings
 */

import { Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';

export function displayGeneralTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: 'General settings' });

	const desc = containerEl.createEl('p', {
		text: 'Configure general settings for the intelligence assistant plugin.'
	});
	desc.setCssProps({ 'color': 'var(--text-muted)' });
	desc.setCssProps({ 'margin-bottom': '20px' });

	// Plugin Version
	new Setting(containerEl)
		.setName('Plugin version')
		.setDesc('Current version of the intelligence assistant plugin')
		.addText(text => text
			.setValue('0.0.1')
			.setDisabled(true));

	// Default Model
	new Setting(containerEl)
		.setName('Default model')
		.setDesc('Default model to use for conversations')
		.addText(text => text
			.setPlaceholder('Deepseek-chat')
			.setValue(plugin.settings.defaultModel)
			.onChange(async (value) => {
				plugin.settings.defaultModel = value;
				await plugin.saveSettings();
			}));

	// Default Chat Mode
	new Setting(containerEl)
		.setName('Default chat mode')
		.setDesc('Choose which mode the chat view opens with')
		.addDropdown(dropdown => dropdown
			.addOption('Chat', 'Chat mode')
			.addOption('Agent', 'Agent mode')
			.setValue(plugin.settings.defaultChatMode ?? 'chat')
			.onChange(async (value) => {
				plugin.settings.defaultChatMode = (value as 'chat' | 'agent');
				await plugin.saveSettings();
			}));

	// Conversation Title Mode
	new Setting(containerEl)
		.setName('Conversation title mode')
		.setDesc('How to generate conversation titles')
		.addDropdown(dropdown => dropdown
			.addOption('first-message', 'Use first message')
			.addOption('auto-summary', 'Auto generate summary')
			.addOption('manual', 'Manual')
			.setValue(plugin.settings.conversationTitleMode)
			.onChange(async (value) => {
				plugin.settings.conversationTitleMode = value;
				await plugin.saveSettings();
			}));

	// Conversation Icon
	new Setting(containerEl)
		.setName('Conversation icons')
		.setDesc('Enable automatic icon generation for conversations')
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
				? `✅ Configured (${plugin.settings.llmConfigs.length} providers, ${conversationCount} conversations)`
				: '⚠️ Incomplete - Please configure providers and models';

			new Setting(containerEl)
				.setName('Configuration status')
				.setDesc('Overall plugin configuration status')
				.addText(text => text
					.setValue(statusValue)
					.setDisabled(true));
		});
	});
}
