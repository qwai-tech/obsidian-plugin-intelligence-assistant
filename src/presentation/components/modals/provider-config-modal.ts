import { App, Modal, Notice, Setting } from 'obsidian';
import type { LLMConfig } from '@/types';
import { applyConfigFieldMetadata } from '@/presentation/utils/config-field-metadata';

export class ProviderConfigModal extends Modal {
	private draft: LLMConfig;
	private readonly onSaveCallback: (config: LLMConfig) => void | Promise<void>;
	private providerContainer: HTMLElement | null = null;

	constructor(app: App, initial: LLMConfig, onSave: (config: LLMConfig) => void | Promise<void>) {
		super(app);
		this.draft = JSON.parse(JSON.stringify(initial));
		this.onSaveCallback = onSave;
	}

		onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Provider Settings' });

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].provider',
			label: 'Provider',
			description: 'Select the LLM provider type'
		}).addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('anthropic', 'Anthropic')
				.addOption('google', 'Google (Gemini)')
				.addOption('deepseek', 'DeepSeek')
				.addOption('ollama', 'Ollama (Local)')
				.addOption('openrouter', 'OpenRouter')
				.addOption('sap-ai-core', 'SAP AI Core')
				.addOption('custom', 'Custom (OpenAI Compatible)')
				.setValue(this.draft.provider)
				.onChange(value => {
					this.draft.provider = value;
					this.renderProviderSpecific();
				}));

		applyConfigFieldMetadata(new Setting(contentEl), {
			path: 'llmConfigs[].modelFilter',
			label: 'Model Filter',
			description: 'Optional regex pattern to limit available models'
		}).addText(text => text
				.setPlaceholder('gpt-4|claude-')
				.setValue(this.draft.modelFilter || '')
				.onChange(value => {
					this.draft.modelFilter = value.trim() || undefined;
				}));

		if (this.draft.provider === 'sap-ai-core') {
			applyConfigFieldMetadata(new Setting(contentEl), {
				path: 'llmConfigs[].resourceGroup',
				label: 'Resource Group',
				description: 'Optional SAP AI Core resource group'
			}).addText(text => text
					.setPlaceholder('default')
					.setValue(this.draft.resourceGroup || '')
					.onChange(value => {
						this.draft.resourceGroup = value.trim() || undefined;
					}));
		}

		this.providerContainer = contentEl.createDiv();
		this.renderProviderSpecific();

		const buttonBar = contentEl.createDiv();
		buttonBar.style.display = 'flex';
		buttonBar.style.justifyContent = 'flex-end';
		buttonBar.style.gap = '8px';
		buttonBar.style.marginTop = '16px';

		const cancelBtn = buttonBar.createEl('button', { text: 'Cancel' });
		cancelBtn.style.padding = '6px 16px';
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonBar.createEl('button', { text: 'Save' });
		saveBtn.style.padding = '6px 16px';
		saveBtn.style.background = 'var(--interactive-accent)';
		saveBtn.style.color = 'white';
		saveBtn.style.border = 'none';
		saveBtn.style.borderRadius = '4px';
		saveBtn.addEventListener('click', async () => {
			await this.onSaveCallback(JSON.parse(JSON.stringify(this.draft)));
			this.close();
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
				label: 'Service Key',
				description: 'SAP AI Core service key (JSON string)'
			}).addTextArea(text => {
					const value = typeof this.draft.serviceKey === 'string'
						? this.draft.serviceKey
						: JSON.stringify(this.draft.serviceKey ?? {}, null, 2);
					text.setValue(value || '');
					text.setPlaceholder('{"clientid": "..."}');
					text.inputEl.rows = 8;
					text.inputEl.style.fontFamily = 'var(--font-monospace)';
					text.onChange((newValue) => {
						try {
							if (!newValue.trim()) {
								this.draft.serviceKey = undefined;
							} else {
								JSON.parse(newValue);
								this.draft.serviceKey = newValue;
							}
							text.inputEl.style.borderColor = 'var(--background-modifier-border)';
						} catch (error) {
							text.inputEl.style.borderColor = 'var(--text-error)';
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
					text.setPlaceholder('sk-...');
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
