import type { SettingDefinitionItem } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import { t } from '@/i18n';

export function generalDefinitions(plugin: PluginHost): SettingDefinitionItem[] {
	return [
		{
			name: t('settings.general.pluginVersion.name'),
			desc: plugin.manifest.version,
		},
		{
			name: t('settings.general.defaultModel.name'),
			desc: t('settings.general.defaultModel.desc'),
			control: { type: 'text', key: 'defaultModel', placeholder: t('settings.general.defaultModel.placeholder') },
		},
		{
			name: t('settings.general.conversationTitleMode.name'),
			desc: t('settings.general.conversationTitleMode.desc'),
			control: {
				type: 'dropdown',
				key: 'conversationTitleMode',
				options: {
					'first-message': t('settings.general.conversationTitleMode.firstMessage'),
					'auto-summary': t('settings.general.conversationTitleMode.autoSummary'),
					manual: t('settings.general.conversationTitleMode.manual'),
				},
			},
		},
		{
			name: t('settings.general.conversationIcons.name'),
			desc: t('settings.general.conversationIcons.desc'),
			control: { type: 'toggle', key: 'conversationIconEnabled' },
		},
		{
			name: t('settings.general.configStatus.name'),
			desc: t('settings.general.configStatus.desc'),
			render: (setting) => {
				if (!(plugin.settings.llmConfigs.length > 0 && plugin.settings.defaultModel)) {
					setting.setDesc(t('settings.general.configStatus.incomplete'));
					return;
				}
				void plugin.services.conversations.getConversationCount().then(conversations => {
					setting.setDesc(t('settings.general.configStatus.ok', { providers: plugin.settings.llmConfigs.length, conversations }));
				});
			},
		},
	];
}
