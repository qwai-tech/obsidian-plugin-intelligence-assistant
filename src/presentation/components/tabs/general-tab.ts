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
	containerEl.createEl('h3', { text: 'General Settings' });

	const desc = containerEl.createEl('p', {
		text: 'Configure general settings for the Intelligence Assistant plugin.'
	});
	desc.style.color = 'var(--text-muted)';
	desc.style.marginBottom = '20px';

	// Plugin Version
	new Setting(containerEl)
		.setName('Plugin Version')
		.setDesc('Current version of the Intelligence Assistant plugin')
		.addText(text => text
			.setValue('0.0.1')
			.setDisabled(true));

	// Default Model
	new Setting(containerEl)
		.setName('Default Model')
		.setDesc('Default model to use for conversations')
		.addText(text => text
			.setPlaceholder('deepseek-chat')
			.setValue(plugin.settings.defaultModel)
			.onChange(async (value) => {
				plugin.settings.defaultModel = value;
				await plugin.saveSettings();
			}));

	// Default Chat Mode
	new Setting(containerEl)
		.setName('Default Chat Mode')
		.setDesc('Choose which mode the Chat view opens with')
		.addDropdown(dropdown => dropdown
			.addOption('chat', 'Chat Mode')
			.addOption('agent', 'Agent Mode')
			.setValue(plugin.settings.defaultChatMode ?? 'chat')
			.onChange(async (value) => {
				plugin.settings.defaultChatMode = (value as 'chat' | 'agent');
				await plugin.saveSettings();
			}));

	// Conversation Title Mode
	new Setting(containerEl)
		.setName('Conversation Title Mode')
		.setDesc('How to generate conversation titles')
		.addDropdown(dropdown => dropdown
			.addOption('first-message', 'Use First Message')
			.addOption('auto-summary', 'Auto Generate Summary')
			.addOption('manual', 'Manual')
			.setValue(plugin.settings.conversationTitleMode)
			.onChange(async (value) => {
				plugin.settings.conversationTitleMode = value;
				await plugin.saveSettings();
			}));

	// Conversation Icon
	new Setting(containerEl)
		.setName('Conversation Icons')
		.setDesc('Enable automatic icon generation for conversations')
		.addToggle(toggle => toggle
			.setValue(plugin.settings.conversationIconEnabled)
			.onChange(async (value) => {
				plugin.settings.conversationIconEnabled = value;
				await plugin.saveSettings();
			}));

	// Configuration Status
	// Get conversation count from storage service instead of settings array
	plugin.getConversationStorageService().then(storageService => {
		storageService.getConversationCount().then(conversationCount => {
			const statusValue = plugin.settings.llmConfigs.length > 0 && plugin.settings.defaultModel
				? `✅ Configured (${plugin.settings.llmConfigs.length} providers, ${conversationCount} conversations)`
				: '⚠️ Incomplete - Please configure providers and models';

			new Setting(containerEl)
				.setName('Configuration Status')
				.setDesc('Overall plugin configuration status')
				.addText(text => text
					.setValue(statusValue)
					.setDisabled(true));
		});
	});
}
