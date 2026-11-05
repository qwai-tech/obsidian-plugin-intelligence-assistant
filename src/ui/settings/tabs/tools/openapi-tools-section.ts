import { notify } from '@/core/notifications';
/**
 * OpenAPI Tools Section
 * Renders the OpenAPI tools table and configuration modal for the tools settings tab
 */

import { SecretComponent, Setting, Modal } from 'obsidian';
import { t } from '@/i18n';
import { createTable } from '@/ui/utils/ui-helpers';
import { TestIds } from '@/ui/utils/test-ids';
import type { PluginHost } from '@/ui/plugin-host';
import { showConfirm } from '@/ui/modals/confirm-modal';
import { setDestructiveButton } from '@/ui/utils/ui-helpers';
import { readableTextField } from '@/ui/utils/readable-text-field';
import type { OpenApiToolConfig, OpenApiAuthType, OpenApiSourceType } from '@/features/tools';
import { errorMessage } from '@/core/utils/errors';

interface SourceFeedback { message: string; failed: boolean; loading?: boolean }
const sourceFeedback = new WeakMap<PluginHost, Map<string, SourceFeedback>>();
function feedbackFor(plugin: PluginHost): Map<string, SourceFeedback> {
	let state = sourceFeedback.get(plugin);
	if (!state) { state = new Map(); sourceFeedback.set(plugin, state); }
	return state;
}

export function renderOpenapiToolsSection(
	content: HTMLElement,
	plugin: PluginHost,
	refreshDisplay: () => void
): void {
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
			await plugin.updateSettings((settings) => {
				settings.openApiTools.push(newConfig);
			});
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
		sourceCell.addClass('ia-readable-source');
		sourceCell.setText(formatSource(config));
		const authCell = row.insertCell();
		authCell.addClass('ia-table-subtext');
		authCell.setText(formatAuth(config));
		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-subtext');
		statusCell.setText(config.enabled ? t('settings.tools.openapi.statusEnabled') : t('settings.tools.openapi.statusDisabled'));
		const feedback = feedbackFor(plugin).get(config.id);
		if (feedback) statusCell.createEl('p', { text: feedback.message, cls: feedback.failed ? 'ia-operation-error' : 'ia-operation-feedback' });

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
				if (!await showConfirm(plugin.app, t('settings.tools.openapi.confirm.delete', { name: config.name || config.id }), { title: t('ux.deleteHttpSource'), confirmText: t('settings.tools.openapi.actions.delete') })) return;
				const list = plugin.settings.openApiTools;
				const index = list.findIndex(entry => entry.id === config.id);
				if (index !== -1) {
					await plugin.updateSettings(() => {
						list.splice(index, 1);
					});
					await plugin.services.tools.removeOpenApi(config.id);
					refreshDisplay();
					notify(t('settings.tools.openapi.notices.removed'));
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
	plugin: PluginHost,
	configId: string,
	forceRefetch: boolean,
	refreshDisplay: () => void
): Promise<void> {
	const states = feedbackFor(plugin);
	if (states.get(configId)?.loading) return;
	const config = plugin.settings.openApiTools.find(tool => tool.id === configId);
	if (!config?.enabled) {
		const message = t('ux.sourceDisabled');
		states.set(configId, { message, failed: false });
		refreshDisplay();
		notify(message, 5000, `openapi:${configId}`);
		return;
	}
	states.set(configId, { message: t('ux.loadingSource'), failed: false, loading: true });
	try {
		const loaded = await plugin.services.tools.reloadOpenApi(configId, { refetch: forceRefetch });
		const fetchedAt = plugin.settings.openApiTools.find(tool => tool.id === configId)?.lastFetchedAt;
		if (fetchedAt) {
			await plugin.updateSettings(settings => {
				const config = settings.openApiTools.find(tool => tool.id === configId);
				if (config) config.lastFetchedAt = fetchedAt;
			});
		}
		const message = t('settings.tools.openapi.notices.reloaded', { count: loaded });
		states.set(configId, { message, failed: false });
		notify(message, 5000, `openapi:${configId}`);
	} catch (error) {
		console.error('[OpenAPI] Failed to reload tools', error);
		const message = t('ux.sourceLoadFailed', { name: config.name, reason: errorMessage(error) });
		states.set(configId, { message, failed: true });
		notify(message, 8000, `openapi:${configId}`);
	} finally {
		refreshDisplay();
	}
}

function createDefaultOpenApiConfig(): OpenApiToolConfig {
	const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `openapi-${Math.random().toString(36).slice(2, 10)}`;
	return {
		id,
		name: t('ux.newHttpSource'),
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
	private readonly config: OpenApiToolConfig;

	constructor(
		private readonly plugin: PluginHost,
		config: OpenApiToolConfig,
		private readonly onChange: () => void
	) {
		super(plugin.app);
		this.config = JSON.parse(JSON.stringify(config)) as OpenApiToolConfig;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.config.name || t('settings.tools.openapi.modal.defaultTitle'));
		let cacheInfo: HTMLParagraphElement | undefined;
		const operationFeedback = contentEl.createEl('p', { cls: 'ia-operation-feedback' });
		operationFeedback.setAttribute('role', 'status');
		const updateFeedback = () => {
			const feedback = feedbackFor(this.plugin).get(this.config.id);
			operationFeedback.setText(feedback?.message ?? '');
			operationFeedback.toggleClass('ia-operation-error', feedback?.failed ?? false);
		};
		updateFeedback();

		const persist = async () => {
			const saved = JSON.parse(JSON.stringify(this.config)) as OpenApiToolConfig;
			await this.plugin.updateSettings((settings) => {
				const index = settings.openApiTools.findIndex(tool => tool.id === saved.id);
				saved.lastFetchedAt = settings.openApiTools[index]?.lastFetchedAt ?? saved.lastFetchedAt;
				settings.openApiTools.splice(index === -1 ? settings.openApiTools.length : index, 1, saved);
			});
			this.onChange();
		};

		const reload = async (forceRefetch = false) => {
			await reloadConfig(this.plugin, this.config.id, forceRefetch, this.onChange);
			this.config.lastFetchedAt = this.plugin.settings.openApiTools.find(tool => tool.id === this.config.id)?.lastFetchedAt;
			if (cacheInfo) cacheInfo.setText(this.cacheDescription());
			updateFeedback();
		};

		new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.displayName.name'))
			.setDesc(t('settings.tools.openapi.modal.displayName.desc'))
			.addText(text => {
				text.setPlaceholder(t('settings.tools.openapi.modal.namePlaceholder'))
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
			const input = readableTextField(new Setting(contentEl)
				.setName(t('settings.tools.openapi.modal.specUrl.name'))
				.setDesc(t('settings.tools.openapi.modal.specUrl.desc')),
			this.config.specUrl ?? '', value => { this.config.specUrl = value.trim(); }, { placeholder: 'https://example.com/openapi.json', rows: 3 });
			input.onblur = () => { void persist(); };
			cacheInfo = contentEl.createEl('p', { text: this.cacheDescription() });
			cacheInfo.addClass('ia-table-subtext');
		} else {
			const input = readableTextField(new Setting(contentEl)
				.setName(t('settings.tools.openapi.modal.specPath.name'))
				.setDesc(t('settings.tools.openapi.modal.specPath.desc')),
			this.config.specPath ?? '', value => { this.config.specPath = value.trim(); }, { placeholder: 'integrations/openapi.json', rows: 3 });
			input.onblur = () => { void persist(); };
		}

		const baseInput = readableTextField(new Setting(contentEl)
			.setName(t('settings.tools.openapi.modal.baseUrl.name'))
			.setDesc(t('settings.tools.openapi.modal.baseUrl.desc')),
		this.config.baseUrl ?? '', value => { this.config.baseUrl = value.trim(); }, { placeholder: 'https://api.example.com' });
		baseInput.onblur = () => { void persist(); };

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
			.addComponent(el => new SecretComponent(this.plugin.app, el)
				.setValue(this.config.authValueSecret ?? '')
				.onChange(async (secret) => {
					this.config.authValueSecret = secret || undefined;
					this.config.authValue = undefined;
					await persist();
				}));

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

		actions.addButton(button => {
			setDestructiveButton(button.setButtonText(t('settings.tools.openapi.actions.delete')))
				.onClick(() => {
					void (async () => {
						if (!await showConfirm(this.plugin.app, t('settings.tools.openapi.confirm.delete', { name: this.config.name || this.config.id }), { title: t('ux.deleteHttpSource'), confirmText: t('settings.tools.openapi.actions.delete') })) return;
						const list = this.plugin.settings.openApiTools;
						const index = list.findIndex(entry => entry.id === this.config.id);
						if (index !== -1) {
							await this.plugin.updateSettings(() => {
								list.splice(index, 1);
							});
							await this.plugin.services.tools.removeOpenApi(this.config.id);
							this.onChange();
							this.close();
						}
					})();
				});
		});
	}

	private cacheDescription(): string {
		const path = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data/openapi/${this.config.id}.json`;
		const date = this.config.lastFetchedAt ? new Date(this.config.lastFetchedAt).toLocaleString() : t('settings.tools.openapi.modal.neverFetched');
		return t('settings.tools.openapi.modal.cachedFile', { path, date });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
