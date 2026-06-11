/**
 * OpenAPI Tools Section
 * Renders the OpenAPI tools table and configuration modal for the tools settings tab
 */

import { Notice, Setting, Modal } from 'obsidian';
import { t } from '@/i18n';
import { createTable } from '@/presentation/utils/ui-helpers';
import { TestIds } from '@/presentation/utils/test-ids';
import type IntelligenceAssistantPlugin from '@plugin';
import type { OpenApiToolConfig, OpenApiAuthType, OpenApiSourceType } from '@/types';

export function renderOpenapiToolsSection(
	content: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	refreshDisplay: () => void
): void {
	if (!Array.isArray(plugin.settings.openApiTools)) {
		plugin.settings.openApiTools = [];
	}
	const configs = plugin.settings.openApiTools;
	const cacheDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/data/openapi/`;
	content.createEl('p', {
		text: t('settings.tools.openapi.desc', { cacheDir }),
	}).addClass('ia-table-subtext');

	const addButton = content.createEl('button', { text: t('settings.tools.openapi.addBtn') });
	addButton.addClass('mod-cta');
	addButton.addEventListener('click', () => {
		void (async () => {
			const newConfig = createDefaultOpenApiConfig();
			plugin.settings.openApiTools.push(newConfig);
			await plugin.saveSettings();
			new OpenApiConfigModal(plugin, newConfig, refreshDisplay).open();
		})();
	});

	if (configs.length === 0) {
		content.createEl('p', { text: t('settings.tools.openapi.noSources') }).addClass('ia-table-subtext');
		return;
	}

	const table = createTable(content, [
		t('settings.tools.openapi.tableHeaders.name'),
		t('settings.tools.openapi.tableHeaders.source'),
		t('settings.tools.openapi.tableHeaders.auth'),
		t('settings.tools.openapi.tableHeaders.status'),
		t('settings.tools.openapi.tableHeaders.actions')
	]);
	const tbody = table.tBodies[0];
	const sorted = [...configs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
	for (const config of sorted) {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');
		row.setAttribute('data-testid', TestIds.settings.toolsOpenApiRow);
		row.setAttribute('data-openapi-id', config.id);

		row.insertCell().setText(config.name || t('settings.tools.openapi.unnamed'));
		const sourceCell = row.insertCell();
		sourceCell.addClass('ia-table-subtext');
		sourceCell.setText(formatSource(config));
		const authCell = row.insertCell();
		authCell.addClass('ia-table-subtext');
		authCell.setText(formatAuth(config));
		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-subtext');
		statusCell.setText(config.enabled ? t('settings.tools.openapi.statusEnabled') : t('settings.tools.openapi.statusDisabled'));

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-cell--actions');

		const editBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.edit') });
		editBtn.addEventListener('click', () => new OpenApiConfigModal(plugin, config, refreshDisplay).open());

		const reloadBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.reload') });
		reloadBtn.addEventListener('click', () => { void reloadConfig(plugin, config.id, false, refreshDisplay); });

		if (config.sourceType === 'url') {
			const refetchBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.refetch') });
			refetchBtn.addEventListener('click', () => { void reloadConfig(plugin, config.id, true, refreshDisplay); });
		}

		const deleteBtn = actionsCell.createEl('button', { text: t('settings.tools.openapi.actions.delete') });
		deleteBtn.addClass('mod-warning');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				const list = plugin.settings.openApiTools;
				const index = list.findIndex(entry => entry.id === config.id);
				if (index !== -1) {
					list.splice(index, 1);
					await plugin.saveSettings();
					await plugin.removeOpenApiConfig(config.id);
					refreshDisplay();
					new Notice(t('settings.tools.openapi.notices.removed'));
				}
			})();
		});
	}
}

function formatSource(config: OpenApiToolConfig): string {
	return config.sourceType === 'url'
		? config.specUrl?.trim() || t('settings.tools.openapi.sourceUrl')
		: config.specPath?.trim() || t('settings.tools.openapi.sourcePath');
}

function formatAuth(config: OpenApiToolConfig): string {
	switch (config.authType) {
		case 'header':
			return t('settings.tools.openapi.authHeader', { key: config.authKey || 'n/a' });
		case 'query':
			return t('settings.tools.openapi.authQuery', { key: config.authKey || 'n/a' });
		default:
			return t('settings.tools.openapi.authNone');
	}
}

async function reloadConfig(
	plugin: IntelligenceAssistantPlugin,
	configId: string,
	forceRefetch: boolean,
	refreshDisplay: () => void
): Promise<void> {
	try {
		const loaded = await plugin.reloadOpenApiConfig(configId, {
			forceRefetch,
			persistCacheMetadata: forceRefetch,
		});
		await plugin.saveSettings();
		refreshDisplay();
		new Notice(t('settings.tools.openapi.notices.reloaded', { count: loaded }));
	} catch (error) {
		console.error('[OpenAPI] Failed to reload tools', error);
		new Notice(t('settings.tools.openapi.notices.reloadFailed'));
	}
}

function createDefaultOpenApiConfig(): OpenApiToolConfig {
	const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `openapi-${Math.random().toString(36).slice(2, 10)}`;
	return {
		id,
		name: 'New HTTP Source',
		enabled: false,
		sourceType: 'file',
		specPath: '',
		specUrl: '',
		baseUrl: '',
		authType: 'none',
		authKey: '',
		authValue: ''
	};
}

class OpenApiConfigModal extends Modal {
	constructor(
		private readonly plugin: IntelligenceAssistantPlugin,
		private readonly config: OpenApiToolConfig,
		private readonly onChange: () => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.config.name || t('settings.tools.openapi.modal.defaultTitle') });

		const persist = async () => {
			await this.plugin.saveSettings();
			this.onChange();
		};

		const reload = async (forceRefetch = false) => {
			await reloadConfig(this.plugin, this.config.id, forceRefetch, this.onChange);
		};

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.displayName.name'))
			.setDesc(t('settings.tools.openapi.modal.displayName.desc'))
			.addText(text => {
				text.setPlaceholder('HTTP source')
					.setValue(this.config.name ?? '')
					.onChange(value => {
						this.config.name = value;
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.enabled.name'))
			.setDesc(t('settings.tools.openapi.modal.enabled.desc'))
			.addToggle(toggle => toggle
				.setValue(Boolean(this.config.enabled))
				.onChange(async (value) => {
					this.config.enabled = value;
					await persist();
					await reload(false);
				}));

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.sourceType.name'))
			.addDropdown(dropdown => {
				dropdown.addOption('file', t('settings.tools.openapi.modal.sourceType.file'));
				dropdown.addOption('url', t('settings.tools.openapi.modal.sourceType.url'));
				dropdown.setValue(this.config.sourceType ?? 'file')
					.onChange(async (value) => {
						this.config.sourceType = value as OpenApiSourceType;
						if (this.config.sourceType === 'file') {
							this.config.specUrl = '';
						} else {
							this.config.specPath = '';
						}
						await persist();
						this.close();
						new OpenApiConfigModal(this.plugin, this.config, this.onChange).open();
					});
			});

		if (this.config.sourceType === 'url') {
			new Setting(contentEl)
				.setName(t('settings.tools.openapi.modal.specUrl.name'))
				.setDesc(t('settings.tools.openapi.modal.specUrl.desc'))
				.addText(text => {
					text.setPlaceholder('https://example.com/openapi.json')
						.setValue(this.config.specUrl ?? '')
						.onChange(value => {
							this.config.specUrl = value.trim();
						});
					text.inputEl.onblur = () => { void persist(); };
				});
			const cachePath = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data/openapi/${this.config.id}.json`;
			const lastFetched = this.config.lastFetchedAt ? new Date(this.config.lastFetchedAt).toLocaleString() : t('settings.tools.openapi.modal.neverFetched');
			contentEl.createEl('p', { text: t('settings.tools.openapi.modal.cachedFile', { path: cachePath, date: lastFetched }) }).addClass('ia-table-subtext');
		} else {
			new Setting(contentEl)
				.setName(t('settings.tools.openapi.modal.specPath.name'))
				.setDesc(t('settings.tools.openapi.modal.specPath.desc'))
				.addText(text => {
					text.setPlaceholder('integrations/openapi.json')
						.setValue(this.config.specPath ?? '')
						.onChange(value => {
							this.config.specPath = value.trim();
						});
					text.inputEl.onblur = () => { void persist(); };
				});
		}

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.baseUrl.name'))
			.setDesc(t('settings.tools.openapi.modal.baseUrl.desc'))
			.addText(text => {
				text.setPlaceholder('https://api.example.com')
					.setValue(this.config.baseUrl ?? '')
					.onChange(value => {
						this.config.baseUrl = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.auth.name'))
			.setDesc(t('settings.tools.openapi.modal.auth.desc'))
			.addDropdown(dropdown => {
				dropdown.addOption('none', t('settings.tools.openapi.modal.auth.none'));
				dropdown.addOption('header', t('settings.tools.openapi.modal.auth.header'));
				dropdown.addOption('query', t('settings.tools.openapi.modal.auth.query'));
				dropdown.setValue(this.config.authType ?? 'none')
					.onChange(async (value) => {
						this.config.authType = value as OpenApiAuthType;
						await persist();
					});
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.credKey.name'))
			.addText(text => {
				text.setPlaceholder(this.config.authType === 'header' ? 'Authorization' : 'api_key')
					.setValue(this.config.authKey ?? '')
					.onChange(value => {
						this.config.authKey = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.credValue.name'))
			.addText(text => {
				const tokenPlaceholder = 'sk-your-token';
				text.setPlaceholder(tokenPlaceholder)
					.setValue(this.config.authValue ?? '')
					.onChange(value => {
						this.config.authValue = value.trim();
					});
				text.inputEl.onblur = () => { void persist(); };
			});

		const actions = new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.actions.name'));
		actions.addButton(button => {
			button.setButtonText(t('settings.tools.openapi.modal.actions.reloadTools'))
				.onClick(() => { void reload(false); });
		});

		if (this.config.sourceType === 'url') {
			actions.addExtraButton(button => {
				button.setIcon('refresh-cw')
					.setTooltip(t('settings.tools.openapi.modal.actions.refetchTooltip'))
					.onClick(() => { void reload(true); });
			});
		}

		actions.addExtraButton(button => {
			button.setIcon('x')
				.setTooltip(t('settings.tools.openapi.modal.actions.deleteTooltip'))
				.onClick(() => {
					void (async () => {
						const list = this.plugin.settings.openApiTools;
						const index = list.findIndex(entry => entry.id === this.config.id);
						if (index !== -1) {
							list.splice(index, 1);
							await this.plugin.saveSettings();
							await this.plugin.removeOpenApiConfig(this.config.id);
							this.onChange();
							this.close();
						}
					})();
				});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
