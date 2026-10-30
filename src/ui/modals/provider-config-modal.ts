import {App, Modal, Notice, SecretComponent, Setting} from 'obsidian';
import type { LLMConfig, OllamaAdmin } from '@/features/llm';
import { applyConfigFieldMetadata } from '@/ui/utils/config-field-metadata';
import { OllamaModelManagerModal } from './ollama-model-manager-modal';
import { t } from '@/i18n';
import { TestIds } from '@/ui/utils/test-ids';

const MODEL_FILTER_PLACEHOLDER = 'gpt-4|claude-';

const LLM_PROVIDER_OPTIONS: Array<{ value: string; labelKey: string }> = [
	{ value: 'openai', labelKey: 'modals.provider.providers.openai' },
	{ value: 'anthropic', labelKey: 'modals.provider.providers.anthropic' },
	{ value: 'google', labelKey: 'modals.provider.providers.google' },
	{ value: 'deepseek', labelKey: 'modals.provider.providers.deepseek' },
	{ value: 'ollama', labelKey: 'modals.provider.providers.ollama' },
	{ value: 'openrouter', labelKey: 'modals.provider.providers.openrouter' },
	{ value: 'custom', labelKey: 'modals.provider.providers.custom' },
];

export class ProviderConfigModal extends Modal {
	private draft: LLMConfig;
	private readonly onSaveCallback: (config: LLMConfig) => void | Promise<void>;
	private providerContainer: HTMLElement | null = null;
	constructor(app: App, private readonly ollama: OllamaAdmin, initial: LLMConfig, onSave: (config: LLMConfig) => void | Promise<void>) {
		super(app);
		const clonedDraft = JSON.parse(JSON.stringify(initial)) as unknown as LLMConfig;
		this.draft = clonedDraft;
		this.onSaveCallback = onSave;
	}

		onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(t('modals.provider.title'));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].provider',
			label: t('modals.provider.selectProvider.name'),
			description: t('modals.provider.selectProvider.desc')
		}).addDropdown(dropdown => {
			dropdown.selectEl.setAttribute('data-testid', TestIds.settings.providerModalProviderSelect);
			dropdown.addOption('', t('modals.provider.selectProvider.placeholder'));
			LLM_PROVIDER_OPTIONS.forEach(option => {
				dropdown.addOption(option.value, t(option.labelKey));
			});
			dropdown
				.setValue(this.draft.provider)
				.onChange(value => {
					this.draft.provider = value;
					void this.renderProviderSpecific();
				});
		});

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].modelFilter',
			label: t('modals.provider.modelFilter.name'),
			description: t('modals.provider.modelFilter.desc')
		}).addText(text => {
				text.inputEl.setAttribute('data-testid', TestIds.settings.providerModalModelFilterInput);
				text
					.setPlaceholder(MODEL_FILTER_PLACEHOLDER)
					.setValue(this.draft.modelFilter || '')
					.onChange(value => {
						this.draft.modelFilter = value.trim() || undefined;
					});
			});

		this.providerContainer = contentEl.createDiv();
		this.renderProviderSpecific();

		const buttonBar = contentEl.createDiv('ia-modal-footer');
		buttonBar.removeClass('ia-hidden');

		const testBtn = buttonBar.createEl('button', { text: t('modals.provider.testConnection') });
		testBtn.setAttribute('data-testid', TestIds.settings.providerModalTestConnectionBtn);
		testBtn.addEventListener('click', () => {
			void this.testConnection(testBtn);
		});

		const cancelBtn = buttonBar.createEl('button', { text: t('modals.provider.cancel') });
		cancelBtn.setAttribute('data-testid', TestIds.settings.providerModalCancelBtn);
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: t('modals.provider.save') });
		saveBtn.setAttribute('data-testid', TestIds.settings.providerModalSaveBtn);
		saveBtn.addClass('mod-cta');
		saveBtn.addEventListener('click', () => {
			void (async () => {
				// Validate before saving
				const validationError = this.validateConfig();
				if (validationError) {
					// Show validation error using Obsidian Notice
					new Notice(validationError, 5000);
					return;
				}

				await this.onSaveCallback(JSON.parse(JSON.stringify(this.draft)) as LLMConfig);
				this.close();
			})();
		});
	}

	private renderProviderSpecific() {
		if (!this.providerContainer) {
			return;
		}

		this.providerContainer.empty();

		if (this.draft.provider === 'ollama') {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].baseUrl',
				label: t('modals.provider.baseUrl.name'),
				description: t('modals.provider.baseUrl.ollamaDesc')
			}).addText(text => {
					text.inputEl.setAttribute('data-testid', TestIds.settings.providerModalBaseUrlInput);
					const baseUrlPlaceholder = 'http://localhost:11434';
					text
						.setPlaceholder(baseUrlPlaceholder)
						.setValue(this.draft.baseUrl || baseUrlPlaceholder)
						.onChange(value => {
							this.draft.baseUrl = value.trim() || undefined;
						});
				});

			new Setting(this.providerContainer)
				.setName(t('modals.provider.manageModels.name'))
				.setDesc(t('modals.provider.manageModels.desc'))
				.addButton(button => button
					.setButtonText(t('modals.provider.manageModels.btn'))
					.onClick(() => {
						new OllamaModelManagerModal(this.app, this.ollama, this.draft, () => undefined).open();
					}));
		} else {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].apiKey',
				label: t('modals.provider.apiKey.name'),
				description: t('modals.provider.apiKey.desc')
			}).addComponent(el => {
					el.setAttribute('data-testid', TestIds.settings.providerModalApiKeyInput);
					return new SecretComponent(this.app, el)
						.setValue(this.draft.apiKeySecret ?? '')
						.onChange(name => {
							this.draft.apiKeySecret = name || undefined;
							this.draft.apiKey = name ? this.app.secretStorage.getSecret(name) ?? undefined : undefined;
						});
				});

			const baseUrlDesc = this.draft.provider === 'custom'
				? t('modals.provider.baseUrl.customDesc')
				: t('modals.provider.baseUrl.optionalDesc');

			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].baseUrl',
				label: t('modals.provider.baseUrl.name'),
				description: baseUrlDesc
			}).addText(text => {
					text.inputEl.setAttribute('data-testid', TestIds.settings.providerModalBaseUrlInput);
					text
						.setPlaceholder(this.getDefaultBaseUrl(this.draft.provider))
						.setValue(this.draft.baseUrl || '')
						.onChange(value => {
							this.draft.baseUrl = value.trim() || undefined;
						});
				});
		}

		this.renderCachedModelsPreview(this.providerContainer);
	}

	private renderCachedModelsPreview(container: HTMLElement): void {
		const wrapper = container.createDiv('ia-provider-cached-models');
		const models = this.draft.cachedModels ?? [];
		wrapper.createDiv('ia-table-subtext').setText(t('modals.provider.cachedModels', { count: models.length }));

		const table = wrapper.createEl('table');
		table.addClass('ia-table');
		table.setAttribute('data-testid', TestIds.settings.providerModalCachedModelsTable);

		const tbody = table.createEl('tbody');
		if (models.length === 0) {
			const row = tbody.createEl('tr');
			const cell = row.createEl('td');
			cell.setText(t('modals.provider.noCachedModels'));
			return;
		}

		models.forEach(model => {
			const row = tbody.createEl('tr');
			row.setAttribute('data-testid', TestIds.settings.providerModalCachedModelRow);
			row.setAttribute('data-model-id', model.id);
			row.createEl('td').setText(model.name || model.id);
			row.createEl('td').setText(model.id);
		});
	}

	private async testConnection(button: HTMLButtonElement): Promise<void> {
		const validationError = this.validateConfig();
		if (validationError) {
			new Notice(validationError, 5000);
			return;
		}

		const originalText = button.textContent ?? t('modals.provider.testConnection');
		button.textContent = t('modals.provider.testing');
		button.disabled = true;
		try {
			const { ModelManager } = await import('@qwai/obsidian-llm');
			const models = await ModelManager.getModelsForConfig(this.draft, true);
			this.draft.cachedModels = models;
			this.draft.cacheTimestamp = Date.now();
			this.renderProviderSpecific();
			new Notice(t('modals.provider.connectionSuccess', { count: models.length }));
		} catch (error) {
			console.error('Provider connection test failed:', error);
			new Notice(t('modals.provider.connectionFailed'));
		} finally {
			button.disabled = false;
			button.textContent = originalText;
		}
	}

	private getDefaultBaseUrl(provider: string): string {
		switch (provider) {
			case 'openai':
				return 'https://api.openai.com/v1';
			case 'anthropic':
				return 'https://api.anthropic.com';
			case 'google':
				return 'https://generativelanguage.googleapis.com';
			case 'deepseek':
				return 'https://api.deepseek.com';
			case 'openrouter':
				return 'https://openrouter.ai/api';
			default:
				return '';
		}
	}

	private validateConfig(): string | null {
		// Validate provider is selected
		if (!this.draft.provider || this.draft.provider.trim() === '') {
			return t('modals.provider.validation.selectProvider');
		}

		if (this.draft.baseUrl && this.draft.baseUrl.trim() !== '') {
			try {
				new URL(this.draft.baseUrl);
			} catch {
				return t('modals.provider.validation.invalidUrl');
			}
		}

		return null; // No validation errors
	}

	onClose() {
		this.contentEl.empty();
	}
}
