import { Setting } from 'obsidian';
import { t } from '@/i18n';
import { builtinToolDefinitions } from '@/features/tools';
import { TestIds } from '@/ui/utils/test-ids';
import type IntelligenceAssistantPlugin from '@plugin';
import { renderIcon } from '@/ui/utils/icon';

export function renderBuiltinToolsSection(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	const toolMetadata: Record<string, { description: string; icon: string }> = {
		'read_file': { description: t('settings.tools.builtIn.toolMeta.readFile.desc'), icon: 'file-text' },
		'write_file': { description: t('settings.tools.builtIn.toolMeta.writeFile.desc'), icon: 'pencil' },
		'list_files': { description: t('settings.tools.builtIn.toolMeta.listFiles.desc'), icon: 'folder' },
		'search_files': { description: t('settings.tools.builtIn.toolMeta.searchFiles.desc'), icon: 'search' },
		'create_note': { description: t('settings.tools.builtIn.toolMeta.createNote.desc'), icon: 'file-plus' },
		'append_to_note': { description: t('settings.tools.builtIn.toolMeta.appendNote.desc'), icon: 'list-plus' }
	};

	const definitions = new Map(builtinToolDefinitions(plugin.app).map(definition => [definition.name, definition]));
	for (const tool of plugin.settings.builtInTools) {
		const metadata = toolMetadata[tool.type];
		const fallbackName = tool.type.replace(/_/g, ' ').replace(/^\w/, l => l.toUpperCase());
		const setting = new Setting(content)
			.setName(t(`settings.tools.builtIn.toolNames.${tool.type}`, { defaultValue: fallbackName }))
			.setDesc(metadata?.description ?? definitions.get(tool.type)?.description ?? '')
			.addToggle(toggle => {
				toggle.toggleEl.setAttribute('data-testid', TestIds.settings.toolsBuiltinToggle);
				toggle.toggleEl.setAttribute('data-tool-type', tool.type);
				toggle.setValue(tool.enabled).onChange(async (enabled) => {
					await plugin.updateSettings(() => {
						tool.enabled = enabled;
					});
					await plugin.services.tools.reloadBuiltin();
				});
			});
		setting.settingEl.setAttribute('data-testid', TestIds.settings.toolsBuiltinRow);
		setting.settingEl.setAttribute('data-tool-type', tool.type);
		renderIcon(setting.nameEl.createSpan({ cls: 'tool-icon', prepend: true }), metadata?.icon, 'wrench');
	}

	const infoBox = content.createDiv('info-callout');
	infoBox.createDiv({ cls: 'ia-info-box__title', text: t('settings.tools.builtIn.infoTitle') });

	const infoText = infoBox.createEl('p', {
		text: t('settings.tools.builtIn.infoText')
	});
	infoText.addClass('table-subtext');
}
