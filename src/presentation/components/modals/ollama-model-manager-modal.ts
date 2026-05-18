/**
 * Ollama Model Manager Modal
 * Manages Ollama models (pull, delete, refresh)
 */

import { App, Modal, Notice, Setting, requestUrl } from 'obsidian';
import type { LLMConfig, ModelInfo } from '@/types';

export class OllamaModelManagerModal extends Modal {
	private config: LLMConfig;
	private onUpdate: () => void;
	private models: ModelInfo[];

	constructor(app: App, config: LLMConfig, onUpdate: () => void) {
		super(app);
		this.config = config;
		this.onUpdate = onUpdate;
		this.models = config.cachedModels || [];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-ollama-manager-modal');

		contentEl.createEl('h2', { text: 'Manage Ollama models' });

		// Server info section
		const serverInfo = contentEl.createDiv('ia-modal-section');
		serverInfo.createEl('h3', { text: 'Server information' });

		const serverStatus = serverInfo.createDiv('ia-server-status');
		serverStatus.setText('Checking server...');

		void this.checkServerStatus(serverStatus);

		// Pull new model section
		this.renderPullSection(contentEl);

		// Installed models section
		this.renderInstalledModels(contentEl);

		// Close button
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('Close')
				.onClick(() => this.close()));
	}

	private async checkServerStatus(statusEl: HTMLElement) {
		try {
			const baseUrl = this.config.baseUrl || 'http://localhost:11434';
			const url = baseUrl.endsWith('/') ? `${baseUrl}api/version` : `${baseUrl}/api/version`;
			const response = await requestUrl({
				url,
				method: 'GET',
				throw: false,
			});

			if (response.status === 200) {
				const data = response.json as { version?: string };
				statusEl.empty();
				statusEl.createEl('span', {
					text: `✅ Server online`,
					cls: 'ia-server-status-online'
				});
				statusEl.createEl('span', {
					text: ` | Version: ${data.version || 'unknown'}`,
					cls: 'ia-server-status-meta'
				});
				statusEl.createEl('span', {
					text: ` | ${baseUrl}`,
					cls: 'ia-server-status-url'
				});
			} else {
				statusEl.setText('❌ Server offline');
				statusEl.addClass('ia-text-error');
			}
		} catch (error) {
			console.error('Failed to check Ollama server status:', error);
			statusEl.setText('❌ Connection error');
			statusEl.addClass('ia-text-error');
		}
	}

	private renderPullSection(containerEl: HTMLElement) {
		const section = containerEl.createDiv('ia-modal-section');
		section.createEl('h3', { text: 'Pull new model' });

		section.createEl('p', {
			text: 'Enter a model name to download from Ollama library (e.g., llama2, mistral, codellama)',
			cls: 'ia-pull-section-hint'
		});

		let modelNameInput: HTMLInputElement;

		new Setting(section)
			.setName('Model name')
			.setDesc('Example: llama2, mistral, codellama:7b')
			.addText(text => {
				modelNameInput = text.inputEl;
				text.setPlaceholder('llama2')
					.inputEl.addClass('ia-full-width');
			})
			.addButton(button => button
				.setButtonText('Pull model')
				.setCta()
				.onClick(async () => {
					const modelName = modelNameInput.value.trim();
					if (!modelName) {
						new Notice('Please enter a model name');
						return;
					}
					await this.pullModel(modelName, button.buttonEl);
				}));
	}

	private renderInstalledModels(containerEl: HTMLElement) {
		const section = containerEl.createDiv('ia-modal-section');
		const header = section.createDiv('ia-modal-section-header');

		header.createEl('h3', { text: 'Installed models' });

		const refreshBtn = header.createEl('button', { text: '🔄 Refresh list' });
		refreshBtn.addClass('ia-button');
		refreshBtn.addClass('ia-button--ghost');
		refreshBtn.addEventListener('click', () => {
			void (async () => {
				await this.refreshModelList(refreshBtn);
			})();
		});

		const modelList = section.createDiv('ia-model-list');

		if (this.models.length === 0) {
			modelList.createEl('p', {
				text: 'No models found. Pull a model to get started.',
				cls: 'ia-model-list-empty'
			});
			return;
		}

		this.models.forEach(model => {
			const modelRow = modelList.createDiv('ia-model-row');

			const modelInfo = modelRow.createDiv();
			modelInfo.createEl('div', {
				text: model.id,
				cls: 'ia-model-name'
			});

			const capabilities = model.capabilities?.join(', ') || 'unknown';
			modelInfo.createEl('div', {
				text: `Capabilities: ${capabilities}`,
				cls: 'ia-model-capabilities'
			});

			const deleteBtn = modelRow.createEl('button', { text: 'Delete' });
			deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addClass('ia-ml-8');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				await this.deleteModel(model.id, deleteBtn);
			})();
		});
		});
	}

	private async pullModel(modelName: string, buttonEl: HTMLElement) {
		const _originalText = buttonEl.textContent;
		buttonEl.textContent = 'Pulling...';
		(buttonEl as HTMLButtonElement).disabled = true;

		try {
			const baseUrl = this.config.baseUrl || 'http://localhost:11434';
			const url = baseUrl.endsWith('/') ? `${baseUrl}api/pull` : `${baseUrl}/api/pull`;

			new Notice(`Pulling ${modelName}... This may take a while.`);

			const response = await requestUrl({
				url,
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: modelName } ),
				throw: false,
			});

			if (response.status >= 200 && response.status < 300) {
				new Notice(`✅ Successfully pulled ${modelName}`);
				await this.refreshModelList();
			} else {
				const errorText = response.text;
				console.error('Pull model error:', errorText);
				new Notice(`❌ Failed to pull model: ${errorText}`);
			}
		} catch (_error) {
			console.error('Failed to pull model:', _error);
			new Notice(`❌ Failed to pull model: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
		} finally {
			(buttonEl as HTMLButtonElement).disabled = false;
			buttonEl.textContent = _originalText;
		}
	}
	
	private async confirmDelete(message: string): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Confirm deletion');
			const { contentEl } = modal;
			contentEl.empty();
			contentEl.createEl('p', { text: message });
			
			const buttonBar = contentEl.createDiv('ia-confirm-button-bar');
			
			const cancelBtn = buttonBar.createEl('button', { text: 'Cancel' });
			cancelBtn.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});
			
			const confirmBtn = buttonBar.createEl('button', { text: 'Delete' });
			confirmBtn.addClass('ia-button');
			confirmBtn.addClass('ia-button--danger');
			confirmBtn.addEventListener('click', () => {
				modal.close();
				resolve(true);
			});
			
			modal.open();
		});
	}
	
	private async deleteModel(modelName: string, buttonEl: HTMLElement) {
		const confirmed = await this.confirmDelete(`Are you sure you want to delete the model "${modelName}"?`);
		if (!confirmed) {
			return;
		}

		const _originalText = buttonEl.textContent;
		buttonEl.textContent = 'Deleting...';
		(buttonEl as HTMLButtonElement).disabled = true;

		try {
			const baseUrl = this.config.baseUrl || 'http://localhost:11434';
			const url = baseUrl.endsWith('/') ? `${baseUrl}api/delete` : `${baseUrl}/api/delete`;

			const response = await requestUrl({
				url,
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: modelName } ),
				throw: false,
			});

			if (response.status >= 200 && response.status < 300) {
				new Notice(`✅ Deleted ${modelName}`);
				await this.refreshModelList();
			} else {
				const errorText = response.text;
				console.error('Delete model error:', errorText);
				new Notice(`❌ Failed to delete model: ${errorText}`);
			}
		} catch (_error) {
			console.error('Failed to delete model:', _error);
			new Notice(`❌ Failed to delete model: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
		} finally {
			(buttonEl as HTMLButtonElement).disabled = false;
			buttonEl.textContent = _originalText;
		}
	}

	private async refreshModelList(buttonEl?: HTMLElement) {
		let originalText: string | null = null;
		if (buttonEl) {
			originalText = buttonEl.textContent;
			buttonEl.textContent = 'Refreshing...';
			(buttonEl as HTMLButtonElement).disabled = true;
		}

		try {
			const { ModelManager } = await import('@/infrastructure/llm/model-manager');
			const models = await ModelManager.getModelsForConfig(this.config, true);
			this.config.cachedModels = models;
			this.config.cacheTimestamp = Date.now();
			this.models = models;

			// Re-render the modal
			this.contentEl.empty();
			this.onOpen();

			// Notify parent to save and refresh
			this.onUpdate();

			new Notice('✅ Model list refreshed');
		} catch (_error) {
			console.error('Failed to refresh models:', _error);
			new Notice('❌ Failed to refresh model list');
		} finally {
			if (buttonEl) {
				(buttonEl as HTMLButtonElement).disabled = false;
				buttonEl.textContent = originalText ?? 'Refresh models';
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
