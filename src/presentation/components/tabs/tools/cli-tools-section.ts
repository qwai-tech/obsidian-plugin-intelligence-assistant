/**
 * CLI Tools Section
 * Renders the CLI tools table, configuration modal, and preset modal
 * for the tools settings tab
 */

import { Notice, Setting, Modal } from 'obsidian';
import { t } from '@/i18n';
import { createTable, createStatusIndicator } from '@/presentation/utils/ui-helpers';
import { TestIds } from '@/presentation/utils/test-ids';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CLIToolConfig } from '@/types';
import { DEFAULT_CLI_TIMEOUT, CLI_TOOL_DEFAULTS, getAvailablePresets, PRESET_CATEGORIES, CLI_TOOL_PRESETS, type CLIToolPreset } from '@/types/features/cli-tools';

export function renderCliToolsSection(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	refreshDisplay: () => void
): void {
	if (!Array.isArray(plugin.settings.cliTools)) {
		plugin.settings.cliTools = [];
	}
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
			plugin.settings.cliTools.push(newConfig);
			await plugin.saveSettings();
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
				config.enabled = !config.enabled;
				await plugin.saveSettings();
				await plugin.reloadCLITools();
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
					list.splice(index, 1);
					await plugin.saveSettings();
					await plugin.reloadCLITools();
					refreshDisplay();
					new Notice(t('settings.tools.cli.notices.removed'));
				}
			})();
		});
	}

	const infoBox = content.createDiv('info-callout');
	const infoTitle = infoBox.createEl('h5', { text: t('settings.tools.cli.infoTitle') });
	infoTitle.addClass('info-callout-title');

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

class CLIToolConfigModal extends Modal {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly config: CLIToolConfig,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.config.name || t('settings.tools.cli.modal.defaultTitle') });

		const persist = async () => {
			await this.plugin.saveSettings();
			await this.plugin.reloadCLITools();
			this.onChange();
		};

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.toolName.name'))
			.setDesc(t('settings.tools.cli.modal.toolName.desc'))
			.addText(text => {
				text.setPlaceholder('my_tool')
					.setValue(this.config.name ?? '')
					.onChange(value => {
						this.config.name = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.description.name'))
			.setDesc(t('settings.tools.cli.modal.description.desc'))
			.addTextArea(text => {
				text.setPlaceholder('Executes a command to...')
					.setValue(this.config.description ?? '')
					.onChange(value => {
						this.config.description = value;
					});
				text.inputEl.onblur = () => { void persist(); };
				text.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.enabled.name'))
			.setDesc(t('settings.tools.cli.modal.enabled.desc'))
			.addToggle(toggle => toggle
				.setValue(Boolean(this.config.enabled))
				.onChange(async (value) => {
					this.config.enabled = value;
					await persist();
				}));

		contentEl.createEl('h4', { text: t('settings.tools.cli.modal.commandConfig') });

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.command.name'))
			.setDesc(t('settings.tools.cli.modal.command.desc'))
			.addText(text => {
				text.setPlaceholder('python')
					.setValue(this.config.command ?? '')
					.onChange(value => {
						this.config.command = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.args.name'))
			.setDesc(t('settings.tools.cli.modal.args.desc'))
			.addTextArea(text => {
				text.setPlaceholder('-c\n{{code}}')
					.setValue((this.config.args ?? []).join('\n'))
					.onChange(value => {
						this.config.args = value.split('\n').filter(line => line.trim());
					});
				text.inputEl.onblur = () => { void persist(); };
				text.inputEl.rows = 4;
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.cwd.name'))
			.setDesc(t('settings.tools.cli.modal.cwd.desc'))
			.addText(text => {
				text.setPlaceholder('/path/to/directory')
					.setValue(this.config.cwd ?? '')
					.onChange(value => {
						this.config.cwd = value.trim() || undefined;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.timeout.name'))
			.setDesc(t('settings.tools.cli.modal.timeout.desc', { timeout: DEFAULT_CLI_TIMEOUT }))
			.addText(text => {
				text.setPlaceholder(String(DEFAULT_CLI_TIMEOUT))
					.setValue(this.config.timeout ? String(this.config.timeout) : '')
					.onChange(value => {
						const num = parseInt(value, 10);
						this.config.timeout = isNaN(num) ? undefined : num;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.shell.name'))
			.setDesc(t('settings.tools.cli.modal.shell.desc'))
			.addToggle(toggle => toggle
				.setValue(this.config.shell ?? true)
				.onChange(async (value) => {
					this.config.shell = value;
					await persist();
				}));

		contentEl.createEl('h4', { text: t('settings.tools.cli.modal.paramsTitle') });
		contentEl.createEl('p', {
			text: t('settings.tools.cli.modal.paramsDesc'),
			cls: 'ia-table-subtext'
		});

		const paramsContainer = contentEl.createDiv('cli-params-container');
		this.renderParameters(paramsContainer, persist);

		const addParamBtn = contentEl.createEl('button', { text: t('settings.tools.cli.modal.addParam') });
		addParamBtn.addEventListener('click', () => {
			if (!this.config.parameters) {
				this.config.parameters = [];
			}
			this.config.parameters.push({
				name: `param${this.config.parameters.length + 1}`,
				type: 'string',
				description: '',
				required: false,
				insertAs: 'template'
			});
			this.renderParameters(paramsContainer, persist);
			void persist();
		});

		contentEl.createEl('h4', { text: t('settings.tools.cli.modal.envTitle') });
		contentEl.createEl('p', {
			text: t('settings.tools.cli.modal.envDesc'),
			cls: 'ia-table-subtext'
		});

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.envVars.name'))
			.setDesc(t('settings.tools.cli.modal.envVars.desc'))
			.addTextArea(text => {
				const envStr = this.config.env
					? Object.entries(this.config.env).map(([k, v]) => `${k}=${v}`).join('\n')
					: '';
				text.setPlaceholder('MY_VAR=value\nANOTHER=value2')
					.setValue(envStr)
					.onChange(value => {
						const env: Record<string, string> = {};
						value.split('\n').forEach(line => {
							const [key, ...rest] = line.split('=');
							if (key?.trim() && rest.length > 0) {
								env[key.trim()] = rest.join('=');
							}
						});
						this.config.env = Object.keys(env).length > 0 ? env : undefined;
					});
				text.inputEl.onblur = () => { void persist(); };
				text.inputEl.rows = 3;
			});
	}

	private renderParameters(container: HTMLElement, persist: () => Promise<void>): void {
		container.empty();

		const params = this.config.parameters ?? [];
		if (params.length === 0) {
			container.createEl('p', { text: t('settings.tools.cli.modal.noParams'), cls: 'ia-table-subtext' });
			return;
		}

		for (let i = 0; i < params.length; i++) {
			const param = params[i];
			const paramDiv = container.createDiv('cli-param-item');
			paramDiv.addClass('ia-cli-tools-param-item');

			const headerDiv = paramDiv.createDiv();
			headerDiv.addClass('ia-cli-tools-param-header');

			headerDiv.createEl('strong', { text: t('settings.tools.cli.modal.paramN', { n: i + 1 }) });

			const removeBtn = headerDiv.createEl('button', { text: '✕' });
			removeBtn.addClass('ia-cli-tools-param-remove');
			removeBtn.addEventListener('click', () => {
				params.splice(i, 1);
				this.renderParameters(container, persist);
				void persist();
			});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.name'))
				.addText(text => {
					text.setValue(param.name)
						.onChange(value => { param.name = value; });
					text.inputEl.onblur = () => { void persist(); };
				});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.type.name'))
				.addDropdown(dropdown => {
					dropdown.addOption('string', t('settings.tools.cli.modal.param.type.string'));
					dropdown.addOption('number', t('settings.tools.cli.modal.param.type.number'));
					dropdown.addOption('boolean', t('settings.tools.cli.modal.param.type.boolean'));
					dropdown.setValue(param.type)
						.onChange(value => {
							param.type = value as 'string' | 'number' | 'boolean';
							void persist();
						});
				});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.description'))
				.addText(text => {
					text.setValue(param.description)
						.onChange(value => { param.description = value; });
					text.inputEl.onblur = () => { void persist(); };
				});

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.required'))
				.addToggle(toggle => toggle
					.setValue(param.required ?? false)
					.onChange(value => {
						param.required = value;
						void persist();
					}));

			new Setting(paramDiv)
				.setName(t('settings.tools.cli.modal.param.insertAs.name'))
				.setDesc(t('settings.tools.cli.modal.param.insertAs.desc'))
				.addDropdown(dropdown => {
					dropdown.addOption('template', 'Template ({{name}})');
					dropdown.addOption('arg', t('settings.tools.cli.modal.param.insertAs.arg'));
					dropdown.addOption('env', t('settings.tools.cli.modal.param.insertAs.env'));
					dropdown.setValue(param.insertAs ?? 'template')
						.onChange(value => {
							param.insertAs = value as 'template' | 'arg' | 'env';
							void persist();
						});
				});

			if (param.insertAs === 'env') {
				new Setting(paramDiv)
					.setName(t('settings.tools.cli.modal.param.envName.name'))
					.setDesc(t('settings.tools.cli.modal.param.envName.desc'))
					.addText(text => {
						text.setPlaceholder(param.name.toUpperCase())
							.setValue(param.envName ?? '')
							.onChange(value => {
								param.envName = value.trim() || undefined;
							});
						text.inputEl.onblur = () => { void persist(); };
					});
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Modal for selecting CLI tool presets
 */
class CLIToolPresetModal extends Modal {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: t('settings.tools.cli.presets.title') });

		contentEl.createEl('p', {
			text: t('settings.tools.cli.presets.desc'),
			cls: 'ia-table-subtext'
		});

		const presets = getAvailablePresets();
		const existingNames = new Set(this.plugin.settings.cliTools?.map(tool => tool.name) ?? []);

		// Group presets by category
		const categories = new Map<string, CLIToolPreset[]>();
		for (const preset of presets) {
			const cat = preset.category;
			if (!categories.has(cat)) {
				categories.set(cat, []);
			}
			categories.get(cat)!.push(preset);
		}

		// Render each category
		for (const [category, categoryPresets] of categories) {
			const categoryName = t(`settings.tools.cli.presets.categories.${category}`, { defaultValue: PRESET_CATEGORIES[category as keyof typeof PRESET_CATEGORIES] || category });
			contentEl.createEl('h4', { text: categoryName });

			const categoryContainer = contentEl.createDiv('cli-preset-category');

			for (const preset of categoryPresets) {
				const isAlreadyAdded = existingNames.has(preset.config.name);

				const presetDiv = categoryContainer.createDiv('cli-preset-item');
				presetDiv.addClass('ia-cli-tools-preset-item');

				const infoDiv = presetDiv.createDiv();
				infoDiv.createEl('strong', { text: t(`settings.tools.cli.presets.names.${preset.id}`, { defaultValue: preset.name }) });
				infoDiv.createEl('div', {
					text: preset.config.description,
					cls: 'ia-table-subtext'
				});
				const commandDiv = infoDiv.createEl('code', {
					text: `${preset.config.command} ${(preset.config.args ?? []).join(' ')}`.trim()
				});
				commandDiv.addClass('ia-cli-tools-preset-command');

				const addBtn = presetDiv.createEl('button', {
					text: isAlreadyAdded ? t('settings.tools.cli.presets.addedBtn') : t('settings.tools.cli.presets.addBtn')
				});
				if (isAlreadyAdded) {
					addBtn.disabled = true;
					addBtn.addClass('ia-cli-tools-preset-add--disabled');
				} else {
					addBtn.addClass('mod-cta');
					addBtn.addEventListener('click', () => {
						void this.addPreset(preset, addBtn);
					});
				}
			}
		}

		// Add close button
		const footer = contentEl.createDiv();
		footer.addClass('ia-cli-tools-preset-footer');
		const closeBtn = footer.createEl('button', { text: t('settings.tools.cli.presets.closeBtn') });
		closeBtn.addEventListener('click', () => this.close());
	}

	private async addPreset(preset: CLIToolPreset, button: HTMLButtonElement): Promise<void> {
		const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `cli-${Math.random().toString(36).slice(2, 10)}`;

		const newConfig: CLIToolConfig = {
			...CLI_TOOL_DEFAULTS,
			...preset.config,
			id,
			enabled: false // Start disabled so user can review
		} as CLIToolConfig;

		if (!this.plugin.settings.cliTools) {
			this.plugin.settings.cliTools = [];
		}
		this.plugin.settings.cliTools.push(newConfig);
		await this.plugin.saveSettings();
		await this.plugin.reloadCLITools();
		this.onChange();

		// Update button state
		button.textContent = t('settings.tools.cli.presets.addedBtn');
		button.disabled = true;
		button.removeClass('mod-cta');
		button.addClass('ia-cli-tools-preset-add--disabled');

		new Notice(t('settings.tools.cli.presets.notices.added', { name: preset.name }));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
