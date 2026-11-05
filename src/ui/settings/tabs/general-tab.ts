import type { SettingDefinition } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import { t } from '@/i18n';
import { modelCatalog } from '@/ui/modals/agent-model-options';
import { NotificationHistoryModal } from '@/ui/modals/notification-history-modal';

export function generalDefinitions(plugin: PluginHost, onModelDropdown?: (refresh: () => void) => void): SettingDefinition[] {
	return [
		{
			name: t('ux.notificationsTitle'),
			desc: t('ux.notificationsDesc'),
			render: setting => {
				setting.addButton(button => button.setButtonText(t('ux.viewNotifications')).onClick(() => new NotificationHistoryModal(plugin.app).open()));
			},
		},
		{
			name: t('settings.general.pluginVersion.name'),
			desc: plugin.manifest.version,
		},
		{
			name: t('settings.general.defaultModel.name'),
			desc: t('settings.general.defaultModel.desc'),
			render: (setting) => {
				setting.addDropdown(dropdown => {
					const refresh = () => {
						const models = modelCatalog(plugin.settings.llmConfigs).options;
						const options = Object.fromEntries(models.map(model => [model.id, model.label]));
						if (!options[plugin.settings.defaultModel]) options[plugin.settings.defaultModel || ''] = plugin.settings.defaultModel || t('chat.header.noModels');
						dropdown.selectEl.empty();
						dropdown.addOptions(options).setValue(plugin.settings.defaultModel);
					};
					refresh();
					onModelDropdown?.(refresh);
					dropdown.onChange(async value => {
						await plugin.updateSettings(settings => { settings.defaultModel = value; });
					});
				});
			},
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
