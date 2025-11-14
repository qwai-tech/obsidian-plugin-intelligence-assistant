import {App, Modal, Setting} from 'obsidian';
import type { LLMConfig } from '@/types';
import { applyConfigFieldMetadata } from '@/presentation/utils/config-field-metadata';

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
		contentEl.createEl('h2', { text: 'Provider settings' });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].provider',
			label: 'Provider',
			description: 'Select the LLM provider type'
		}).addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('anthropic', 'Anthropic')
				.addOption('google', 'Google (gemini)')
				.addOption('deepseek', 'Deepseek')
				.addOption('ollama', 'Ollama (local)')
				.addOption('openrouter', 'OpenRouter')
				.addOption('sap-ai-core', 'SAP AI Core')
				.addOption('custom', 'Custom (openai compatible)')
				.setValue(this.draft.provider)
				.onChange(value => {
					this.draft.provider = value;
					void this.renderProviderSpecific();
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].modelFilter',
			label: 'Model filter',
			description: 'Optional regex pattern to limit available models'
		}).addText(text => text
				.setPlaceholder('Gpt-4|claude-')
				.setValue(this.draft.modelFilter || '')
				.onChange(value => {
					this.draft.modelFilter = value.trim() || undefined;
				}));

		if (this.draft.provider === 'sap-ai-core') {
			applyConfigFieldMetadata(new Setting(contentEl), {
				path: 'llmConfigs[].resourceGroup',
				label: 'Resource group',
				description: 'Optional SAP AI Core resource group'
			}).addText(text => text
					.setPlaceholder('Default')
					.setValue(this.draft.resourceGroup || '')
					.onChange(value => {
						this.draft.resourceGroup = value.trim() || undefined;
					}));
		}

		this.providerContainer = contentEl.createDiv();
		this.renderProviderSpecific();

		const buttonBar = contentEl.createDiv();
		buttonBar.removeClass('ia-hidden');
		buttonBar.setCssProps({ 'justify-content': 'flex-end' });
		buttonBar.setCssProps({ 'gap': '8px' });
		buttonBar.setCssProps({ 'margin-top': '16px' });

		const cancelBtn = buttonBar.createEl('button', { text: 'Cancel' });
		cancelBtn.setCssProps({ 'padding': '6px 16px' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: 'Save' });
		saveBtn.setCssProps({ 'padding': '6px 16px' });
		saveBtn.setCssProps({ 'background': 'var(--interactive-accent)' });
		saveBtn.setCssProps({ 'color': 'white' });
		saveBtn.setCssProps({ 'border': 'none' });
		saveBtn.setCssProps({ 'border-radius': '4px' });
		saveBtn.addEventListener('click', () => {
			void (async () => {
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
				label: 'Service key',
				description: 'SAP AI Core service key (JSON string)'
			}).addTextArea(text => {
					const value = typeof this.draft.serviceKey === 'string'
						? this.draft.serviceKey
						: JSON.stringify(this.draft.serviceKey ?? {}, null, 2);
					text.setValue(value || '');
					text.setPlaceholder('{"clientid": "..."}');
					text.inputEl.rows = 8;
					text.inputEl.setCssProps({ 'font-family': 'var(--font-monospace)' });
					text.onChange((newValue) => {
						try {
							if (!newValue.trim()) {
								this.draft.serviceKey = undefined;
							} else {
								JSON.parse(newValue);
								this.draft.serviceKey = newValue;
							}
							text.inputEl.setCssProps({ 'border-color': 'var(--background-modifier-border)' });
						} catch (_error) {
							text.inputEl.setCssProps({ 'border-color': 'var(--text-error)' });
						}
					});
				});
		} else if (this.draft.provider === 'ollama') {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].baseUrl',
				label: 'Base URL',
				description: 'Ollama server URL'
			}).addText(text => text
					.setPlaceholder('http://localhost:11434')
					.setValue(this.draft.baseUrl || 'http://localhost:11434')
					.onChange(value => {
						this.draft.baseUrl = value.trim() || undefined;
					}));
		} else {
			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].apiKey',
				label: 'API Key',
				description: 'Authentication key for the selected provider'
			}).addText(text => {
					text.setPlaceholder('Sk-...');
					text.inputEl.type = 'password';
					text.setValue(this.draft.apiKey || '');
					text.onChange(value => {
						this.draft.apiKey = value.trim() || undefined;
					});
				});

			const baseUrlDesc = this.draft.provider === 'custom'
				? 'OpenAI-compatible API endpoint (required)'
				: 'Custom API endpoint (optional)';

			applyConfigFieldMetadata(new Setting(this.providerContainer), {
				path: 'llmConfigs[].baseUrl',
				label: 'Base URL',
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

	onClose() {
		this.contentEl.empty();
	}
}
