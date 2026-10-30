import { Notice } from 'obsidian';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CLIToolConfig } from '@/features/tools';
import { CLI_TOOL_DEFAULTS, CLI_TOOL_PRESETS } from '@/features/tools';
import { createTable, createStatusIndicator } from '@/ui/utils/ui-helpers';
import { TestIds } from '@/ui/utils/test-ids';
import { CLIToolConfigModal } from '@/ui/modals/cli-tool-config-modal';
import { CLIToolPresetModal } from '@/ui/modals/cli-tool-preset-modal';

export function renderCliToolsSection(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	refreshDisplay: () => void
): void {
	const configs = plugin.settings.cliTools;

	content.createEl('p', {
		text: t('settings.tools.cli.desc'),
	}).addClass('ia-table-subtext');

	const buttonContainer = content.createDiv();
	buttonContainer.addClass('ia-cli-tools-toolbar');

	const addButton = buttonContainer.createEl('button', { text: t('settings.tools.cli.addBtn') });
	addButton.addClass('mod-cta');
	addButton.addEventListener('click', () => {
		void (async () => {
			const newConfig = createDefaultCLIToolConfig();
			await plugin.updateSettings((settings) => {
				settings.cliTools.push(newConfig);
			});
			new CLIToolConfigModal(plugin, newConfig, refreshDisplay).open();
		})();
	});

	const presetButton = buttonContainer.createEl('button', { text: t('settings.tools.cli.presetsBtn') });
	presetButton.addEventListener('click', () => {
		new CLIToolPresetModal(plugin, refreshDisplay).open();
	});

	if (configs.length === 0) {
		content.createEl('p', { text: t('settings.tools.cli.noTools') }).addClass('ia-table-subtext');
		return;
	}

	const table = createTable(content, [
		t('settings.tools.cli.tableHeaders.name'),
		t('settings.tools.cli.tableHeaders.command'),
		t('settings.tools.cli.tableHeaders.parameters'),
		t('settings.tools.cli.tableHeaders.status'),
		t('settings.tools.cli.tableHeaders.actions')
	]);
	const tbody = table.tBodies[0];
	const sorted = [...configs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

	for (const config of sorted) {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');
		row.setAttribute('data-testid', TestIds.settings.toolsCliRow);
		row.setAttribute('data-cli-id', config.id);

		const nameCell = row.insertCell();
		nameCell.addClass('ia-table-cell');
		const nameDiv = nameCell.createDiv('tool-name');
		nameDiv.createSpan('tool-icon').setText('⌨️');
		const preset = CLI_TOOL_PRESETS.find(p => p.config.name === config.name);
		const displayName = preset
			? t(`settings.tools.cli.presets.names.${preset.id}`)
			: config.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
		nameDiv.createSpan().setText(displayName || t('settings.tools.cli.unnamed'));

		const commandCell = row.insertCell();
		commandCell.addClass('ia-table-cell');
		commandCell.addClass('ia-table-subtext');
		const commandText = config.args?.length
			? `${config.command} ${config.args.join(' ')}`
			: config.command;
		commandCell.setText(commandText.length > 50 ? commandText.slice(0, 47) + '...' : commandText);

		const paramsCell = row.insertCell();
		paramsCell.addClass('ia-table-cell');
		paramsCell.addClass('ia-table-subtext');
		const paramCount = config.parameters?.length ?? 0;
		paramsCell.setText(paramCount > 0 ? t(paramCount === 1 ? 'settings.tools.cli.paramCount' : 'settings.tools.cli.paramCount_plural', { count: paramCount }) : t('settings.tools.cli.noParams'));

		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		createStatusIndicator(statusCell, config.enabled ? 'success' : 'warning', config.enabled ? t('settings.tools.cli.statusEnabled') : t('settings.tools.cli.statusDisabled'));

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-cell--actions');

		const editBtn = actionsCell.createEl('button', { text: t('settings.tools.cli.actions.edit') });
		editBtn.addEventListener('click', () => new CLIToolConfigModal(plugin, config, refreshDisplay).open());

		const toggleBtn = actionsCell.createEl('button', { text: config.enabled ? t('settings.tools.cli.actions.disable') : t('settings.tools.cli.actions.enable') });
		toggleBtn.addEventListener('click', () => {
			void (async () => {
				await plugin.updateSettings(() => {
					config.enabled = !config.enabled;
				});
				await plugin.services.tools.reloadCli();
				refreshDisplay();
			})();
		});

		const deleteBtn = actionsCell.createEl('button', { text: t('settings.tools.cli.actions.delete') });
		deleteBtn.addClass('mod-warning');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				const list = plugin.settings.cliTools;
				const index = list.findIndex(entry => entry.id === config.id);
				if (index !== -1) {
					await plugin.updateSettings(() => {
						list.splice(index, 1);
					});
					await plugin.services.tools.reloadCli();
					refreshDisplay();
					new Notice(t('settings.tools.cli.notices.removed'));
				}
			})();
		});
	}

	const infoBox = content.createDiv('info-callout');
	infoBox.createDiv({ cls: 'ia-info-box__title', text: t('settings.tools.cli.infoTitle') });

	const infoText = infoBox.createEl('p', {
		text: t('settings.tools.cli.infoText')
	});
	infoText.addClass('table-subtext');
}

function createDefaultCLIToolConfig(): CLIToolConfig {
	const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `cli-${Math.random().toString(36).slice(2, 10)}`;
	return {
		...CLI_TOOL_DEFAULTS,
		id,
		name: 'New CLI Tool',
		description: 'A command-line tool',
		command: '',
		enabled: false
	} as CLIToolConfig;
}
