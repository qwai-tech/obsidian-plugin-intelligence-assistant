import { Setting } from 'obsidian';
import { t } from '@/i18n';
import { builtinToolDefinitions } from '@/features/tools';
import { TestIds } from '@/ui/utils/test-ids';
import type { PluginHost } from '@/ui/plugin-host';
import { renderIcon } from '@/ui/utils/icon';

const TOOL_METADATA: Record<string, { key: string; icon: string }> = {
	read_file: { key: 'readFile', icon: 'file-text' },
	write_file: { key: 'writeFile', icon: 'pencil' },
	list_files: { key: 'listFiles', icon: 'folder' },
	search_files: { key: 'searchFiles', icon: 'search' },
	create_note: { key: 'createNote', icon: 'file-plus' },
	append_to_note: { key: 'appendNote', icon: 'list-plus' },
	update_properties: { key: 'updateProperties', icon: 'list' },
	read_canvas: { key: 'readCanvas', icon: 'layout-dashboard' },
	update_canvas: { key: 'updateCanvas', icon: 'layout-dashboard' },
	read_pdf: { key: 'readPdf', icon: 'file-text' },
	find_notes_by_tag: { key: 'findNotesByTag', icon: 'tag' },
	resolve_link: { key: 'resolveLink', icon: 'link' },
	make_link: { key: 'makeLink', icon: 'link-2' },
};

export function renderBuiltinToolsSection(
	content: HTMLElement,
	plugin: PluginHost
): void {
	const definitions = new Map(builtinToolDefinitions(plugin.app).map(definition => [definition.name, definition]));
	for (const tool of plugin.settings.builtInTools) {
		const metadata = TOOL_METADATA[tool.type];
		const fallbackName = tool.type.replace(/_/g, ' ').replace(/^\w/, l => l.toUpperCase());
		const setting = new Setting(content)
			.setName(t(`settings.tools.builtIn.toolNames.${tool.type}`, { defaultValue: fallbackName }))
			.setDesc(metadata ? t(`settings.tools.builtIn.toolMeta.${metadata.key}.desc`) : definitions.get(tool.type)?.description ?? '')
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
