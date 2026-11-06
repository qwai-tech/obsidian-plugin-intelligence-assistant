import { notify } from '@/core/notifications';
import { Modal, Setting } from 'obsidian';
import { t } from '@/i18n';
import type { PluginHost } from '@/ui/plugin-host';
import type { CLIToolConfig, CLIToolPreset } from '@/features/tools';
import { CLI_TOOL_DEFAULTS, availablePresets, PRESET_CATEGORIES } from '@/features/tools';

export class CLIToolPresetModal extends Modal {
	constructor(
		private readonly plugin: PluginHost,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(t('settings.tools.cli.presets.title'));
		contentEl.createEl('p', { text: t('ux.cliRisk'), cls: 'ia-callout ia-text-warning' });

		contentEl.createEl('p', {
			text: t('settings.tools.cli.presets.desc'),
			cls: 'ia-table-subtext'
		});

		const presets = availablePresets(process.platform);
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
			new Setting(contentEl).setName(categoryName).setHeading();

			const categoryContainer = contentEl.createDiv('cli-preset-category');

			for (const preset of categoryPresets) {
				const isAlreadyAdded = existingNames.has(preset.config.name);

				const presetDiv = categoryContainer.createDiv('cli-preset-item');
				presetDiv.addClass('ia-cli-tools-preset-item');

				const infoDiv = presetDiv.createDiv();
				infoDiv.createEl('strong', { text: t(`settings.tools.cli.presets.names.${preset.id}`, { defaultValue: preset.name }) });
				infoDiv.createDiv({
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
		};

		await this.plugin.updateSettings((settings) => {
			settings.cliTools.push(newConfig);
		});
		await this.plugin.services.tools.reloadCli();
		this.onChange();

		// Update button state
		button.textContent = t('settings.tools.cli.presets.addedBtn');
		button.disabled = true;
		button.removeClass('mod-cta');
		button.addClass('ia-cli-tools-preset-add--disabled');

		notify(t('settings.tools.cli.presets.notices.added', { name: preset.name }));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
