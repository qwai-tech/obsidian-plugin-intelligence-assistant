import {App, Modal, Notice, Setting} from 'obsidian';
import type { LLMConfig } from '@/types';
import { applyConfigFieldMetadata } from '@/presentation/utils/config-field-metadata';
import { OllamaModelManagerModal } from './ollama-model-manager-modal';
import { t } from '@/i18n';

export class ProviderConfigModal extends Modal {
	private draft: LLMConfig;
	private readonly onSaveCallback: (config: LLMConfig) => void | Promise<void>;
	private providerContainer: HTMLElement | null = null;
	constructor(app: App, initial: LLMConfig, onSave: (config: LLMConfig) => void | Promise<void>) {
		super(app);
		const clonedDraft = JSON.parse(JSON.stringify(initial)) as unknown as LLMConfig;
		this.draft = clonedDraft;
		this.onSaveCallback = onSave;
	}

		onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: t('modals.provider.title') });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].provider',
			label: t('modals.provider.selectProvider.name'),
			description: t('modals.provider.selectProvider.desc')
		}).addDropdown(dropdown => dropdown
				.addOption('', t('modals.provider.selectProvider.placeholder'))
				.addOption('openai', t('modals.provider.providers.openai'))
				.addOption('anthropic', t('modals.provider.providers.anthropic'))
				.addOption('google', t('modals.provider.providers.google'))
				.addOption('deepseek', t('modals.provider.providers.deepseek'))
				.addOption('ollama', t('modals.provider.providers.ollama'))
				.addOption('openrouter', t('modals.provider.providers.openrouter'))
				.addOption('sap-ai-core', t('modals.provider.providers.sapAiCore'))
				.addOption('custom', t('modals.provider.providers.custom'))
				.setValue(this.draft.provider)
				.onChange(value => {
					this.draft.provider = value;
					void this.renderProviderSpecific();
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].modelFilter',
			label: t('modals.provider.modelFilter.name'),
			description: t('modals.provider.modelFilter.desc')
		}).addText(text => text
				.setPlaceholder('Gpt-4|claude-')
				.setValue(this.draft.modelFilter || '')
				.onChange(value => {
					this.draft.modelFilter = value.trim() || undefined;
				}));

		if (this.draft.provider === 'sap-ai-core') {
			applyConfigFieldMetadata(new Setting(contentEl), {
				path: 'llmConfigs[].resourceGroup',
				label: t('modals.provider.resourceGroup.name'),
				description: t('modals.provider.resourceGroup.desc')
			}).addText(text => text
					.setPlaceholder('Default')
					.setValue(this.draft.resourceGroup || '')
					.onChange(value => {
						this.draft.resourceGroup = value.trim() || undefined;
					}));
		}

		this.providerContainer = contentEl.createDiv();
		this.renderProviderSpecific();

		const buttonBar = contentEl.createDiv('ia-modal-footer');
		buttonBar.removeClass('ia-hidden');

		const cancelBtn = buttonBar.createEl('button', { text: t('modals.provider.cancel') });
		cancelBtn.addClass('ia-modal-btn');
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: t('modals.provider.save') });
		saveBtn.addClass('ia-modal-btn--primary');
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

		if (this.draft.provider === 'sap-ai-core') {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].serviceKey',
				label: t('modals.provider.serviceKey.name'),
				description: t('modals.provider.serviceKey.desc')
			}).addTextArea(text => {
					const value = typeof this.draft.serviceKey === 'string'
						? this.draft.serviceKey
						: JSON.stringify(this.draft.serviceKey ?? {}, null, 2);
					text.setValue(value || '');
					text.setPlaceholder('{"clientid": "..."}');
					text.inputEl.rows = 8;
					text.inputEl.addClass('ia-textarea--code');
					text.onChange((newValue) => {
						try {
							if (!newValue.trim()) {
								this.draft.serviceKey = undefined;
							} else {
								JSON.parse(newValue);
								this.draft.serviceKey = newValue;
							}
							text.inputEl.setCssProps({ 'border-color': 'var(--background-modifier-border)' });
						} catch (error) {
							console.error('Invalid service key JSON:', error);
							text.inputEl.setCssProps({ 'border-color': 'var(--text-error)' });
						}
					});
				});
		} else if (this.draft.provider === 'ollama') {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].baseUrl',
				label: t('modals.provider.baseUrl.name'),
				description: t('modals.provider.baseUrl.ollamaDesc')
			}).addText(text => text
					.setPlaceholder('http://localhost:11434')
					.setValue(this.draft.baseUrl || 'http://localhost:11434')
					.onChange(value => {
						this.draft.baseUrl = value.trim() || undefined;
					}));

			new Setting(this.providerContainer)
				.setName(t('modals.provider.manageModels.name'))
				.setDesc(t('modals.provider.manageModels.desc'))
				.addButton(button => button
					.setButtonText(t('modals.provider.manageModels.btn'))
					.onClick(() => {
						new OllamaModelManagerModal(this.app, this.draft, () => {
							// No specific action needed on close as this is just pulling models
						}).open();
					}));
		} else {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].apiKey',
				label: t('modals.provider.apiKey.name'),
				description: t('modals.provider.apiKey.desc')
			}).addText(text => {
					text.setPlaceholder('Sk-...');
					text.inputEl.type = 'password';
					text.setValue(this.draft.apiKey || '');
					text.onChange(value => {
						this.draft.apiKey = value.trim() || undefined;
					});
				});

			const baseUrlDesc = this.draft.provider === 'custom'
				? t('modals.provider.baseUrl.customDesc')
				: t('modals.provider.baseUrl.optionalDesc');

			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].baseUrl',
				label: t('modals.provider.baseUrl.name'),
				description: baseUrlDesc
			}).addText(text => text
					.setPlaceholder(this.getDefaultBaseUrl(this.draft.provider))
					.setValue(this.draft.baseUrl || '')
					.onChange(value => {
						this.draft.baseUrl = value.trim() || undefined;
					}));
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

		if (this.draft.apiKey && this.draft.apiKey.length > 500) {
			return t('modals.provider.validation.apiKeyTooLong');
		}

		if (this.draft.baseUrl && this.draft.baseUrl.trim() !== '') {
			try {
				new URL(this.draft.baseUrl);
			} catch (_e) {
				return t('modals.provider.validation.invalidUrl');
			}
		}

		return null; // No validation errors
	}

	onClose() {
		this.contentEl.empty();
	}
}
