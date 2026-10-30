/**
 * Built-in Tools Section
 * Renders the built-in tools table for the tools settings tab
 */

import { t } from '@/i18n';
import { createTable } from '@/ui/utils/ui-helpers';
import { TestIds } from '@/ui/utils/test-ids';
import type IntelligenceAssistantPlugin from '@plugin';

export function renderBuiltinToolsSection(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	const toolMetadata: Record<string, {
		category: string;
		description: string;
		parameters: string;
		icon: string;
	}> = {
		'read_file': { category: t('settings.tools.builtIn.categories.fileOps'), description: t('settings.tools.builtIn.toolMeta.readFile.desc'), parameters: t('settings.tools.builtIn.toolMeta.readFile.params'), icon: '📖' },
		'write_file': { category: t('settings.tools.builtIn.categories.fileOps'), description: t('settings.tools.builtIn.toolMeta.writeFile.desc'), parameters: t('settings.tools.builtIn.toolMeta.writeFile.params'), icon: '✍️' },
		'list_files': { category: t('settings.tools.builtIn.categories.fileOps'), description: t('settings.tools.builtIn.toolMeta.listFiles.desc'), parameters: t('settings.tools.builtIn.toolMeta.listFiles.params'), icon: '📁' },
		'search_files': { category: t('settings.tools.builtIn.categories.searchDisc'), description: t('settings.tools.builtIn.toolMeta.searchFiles.desc'), parameters: t('settings.tools.builtIn.toolMeta.searchFiles.params'), icon: '🔍' },
		'create_note': { category: t('settings.tools.builtIn.categories.noteMgmt'), description: t('settings.tools.builtIn.toolMeta.createNote.desc'), parameters: t('settings.tools.builtIn.toolMeta.createNote.params'), icon: '📝' },
		'append_to_note': { category: t('settings.tools.builtIn.categories.noteMgmt'), description: t('settings.tools.builtIn.toolMeta.appendNote.desc'), parameters: t('settings.tools.builtIn.toolMeta.appendNote.params'), icon: '➕' }
	};

	const table = createTable(content, [
		t('settings.tools.builtIn.tableHeaders.name'),
		t('settings.tools.builtIn.tableHeaders.category'),
		t('settings.tools.builtIn.tableHeaders.description'),
		t('settings.tools.builtIn.tableHeaders.parameters'),
		t('settings.tools.builtIn.tableHeaders.enabled')
	]);
	const tbody = table.tBodies[0];

	plugin.settings.builtInTools.forEach(tool => {
		const metadata = toolMetadata[tool.type];
		if (!metadata) {
			return;
		}

		const row = tbody.insertRow();
		row.addClass('ia-table-row');
		row.setAttribute('data-testid', TestIds.settings.toolsBuiltinRow);
		row.setAttribute('data-tool-type', tool.type);

		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameDiv = nameCell.createDiv('tool-name');
		nameDiv.createSpan('tool-icon').setText(metadata.icon);
		const fallbackName = tool.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
		nameDiv.createSpan().setText(t(`settings.tools.builtIn.toolNames.${tool.type}`, { defaultValue: fallbackName }));

		const categoryCell = row.insertCell();
		categoryCell.addClass('ia-table-cell');
		categoryCell.addClass('ia-table-subtext');
		categoryCell.setText(metadata.category);

		const descCell = row.insertCell();
		descCell.addClass('ia-table-cell');
		descCell.setText(metadata.description);

		const paramsCell = row.insertCell();
		paramsCell.addClass('ia-table-cell');
		paramsCell.addClass('ia-table-subtext');
		paramsCell.setText(metadata.parameters);

		const enabledCell = row.insertCell();
		enabledCell.addClass('ia-table-cell');
		enabledCell.addClass('ia-table-cell--center');

		const toggle = enabledCell.createEl('input', { type: 'checkbox' });
		toggle.setAttribute('data-testid', TestIds.settings.toolsBuiltinToggle);
		toggle.setAttribute('data-tool-type', tool.type);
		toggle.checked = tool.enabled;
		toggle.addEventListener('change', () => {
			void (async () => {
				await plugin.updateSettings(() => {
					tool.enabled = toggle.checked;
				});
				// Re-load the builtin source so the registry reflects the new
				// enabled set; otherwise the toggle is purely cosmetic until
				// the plugin reloads.
				await plugin.services.tools.reloadBuiltin();
			})();
		});
	});

	const infoBox = content.createDiv('info-callout');
	infoBox.createDiv({ cls: 'ia-info-box__title', text: t('settings.tools.builtIn.infoTitle') });

	const infoText = infoBox.createEl('p', {
		text: t('settings.tools.builtIn.infoText')
	});
	infoText.addClass('table-subtext');
}
