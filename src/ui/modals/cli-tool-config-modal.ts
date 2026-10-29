import { Setting, Modal } from 'obsidian';
import { t } from '@/i18n/index';
import type IntelligenceAssistantPlugin from '@plugin';
import type { CLIToolConfig } from '@/features/tools/types/cli-tools';
import { DEFAULT_CLI_TIMEOUT } from '@/features/tools/types/cli-tools';

export class CLIToolConfigModal extends Modal {
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
			await this.plugin.services.tools.reloadCli();
			this.onChange();
		};

		new Setting(contentEl)
			.setName(t('settings.tools.cli.modal.toolName.name'))
			.setDesc(t('settings.tools.cli.modal.toolName.desc'))
			.addText(text => {
				const toolNamePlaceholder = 'my_tool';
				text.setPlaceholder(toolNamePlaceholder)
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
				const commandPlaceholder = 'python';
				text.setPlaceholder(commandPlaceholder)
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
				const envPlaceholder = 'MY_VAR=value\nANOTHER=value2';
				text.setPlaceholder(envPlaceholder)
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
