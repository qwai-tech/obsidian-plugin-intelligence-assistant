/**
 * Ollama Model Manager Modal
 * Manages Ollama models (pull, delete, refresh)
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type { OllamaAdmin, LLMConfig, ModelInfo } from '@/features/llm';
import { t } from '@/i18n';
import { errorMessage } from '@/core/utils/errors';

export class OllamaModelManagerModal extends Modal {
	private config: LLMConfig;
	private onUpdate: () => void;
	private models: ModelInfo[];

	constructor(app: App, private readonly admin: OllamaAdmin, config: LLMConfig, onUpdate: () => void) {
		super(app);
		this.config = config;
		this.onUpdate = onUpdate;
		this.models = config.cachedModels || [];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-ollama-manager-modal');

		this.setTitle(t('modals.ollamaManager.title'));

		const serverInfo = contentEl.createDiv('ia-modal-section');
		new Setting(serverInfo).setName(t('modals.ollamaManager.serverInfo')).setHeading();

		const serverStatus = serverInfo.createDiv('ia-server-status');
		serverStatus.setText(t('modals.ollamaManager.checkingServer'));

		void this.checkServerStatus(serverStatus);

		// Pull new model section
		this.renderPullSection(contentEl);

		// Installed models section
		this.renderInstalledModels(contentEl);

		new Setting(contentEl)
			.addButton(button => button
				.setButtonText(t('modals.ollamaManager.closeBtn'))
				.onClick(() => this.close()));
	}

	private get baseUrl(): string {
		return this.config.baseUrl || 'http://localhost:11434';
	}

	private async checkServerStatus(statusEl: HTMLElement) {
		const baseUrl = this.baseUrl;
		const status = await this.admin.status(baseUrl);
		if (status.online) {
				statusEl.empty();
				statusEl.createEl('span', {
					text: t('modals.ollamaManager.serverOnline'),
					cls: 'ia-server-status-online'
				});
				statusEl.createEl('span', {
					text: t('modals.ollamaManager.versionLabel', { version: status.version || 'unknown' }),
					cls: 'ia-server-status-meta'
				});
				statusEl.createEl('span', {
					text: t('modals.ollamaManager.urlLabel', { url: baseUrl }),
					cls: 'ia-server-status-url'
				});
			} else {
				statusEl.setText(t('modals.ollamaManager.serverOffline'));
				statusEl.addClass('ia-text-error');
			}
	}

	private renderPullSection(containerEl: HTMLElement) {
		const section = containerEl.createDiv('ia-modal-section');
		new Setting(section).setName(t('modals.ollamaManager.pullTitle')).setHeading();

		section.createEl('p', {
			text: t('modals.ollamaManager.pullHint'),
			cls: 'ia-pull-section-hint'
		});

		let modelNameInput: HTMLInputElement;

		new Setting(section)
			.setName(t('modals.ollamaManager.modelName.name'))
			.setDesc(t('modals.ollamaManager.modelName.example'))
			.addText(text => {
				modelNameInput = text.inputEl;
				const modelPlaceholder = 'llama2';
				text.setPlaceholder(modelPlaceholder)
					.inputEl.addClass('ia-full-width');
			})
			.addButton(button => button
				.setButtonText(t('modals.ollamaManager.pullBtn'))
				.setCta()
				.onClick(async () => {
					const modelName = modelNameInput.value.trim();
					if (!modelName) {
						new Notice(t('modals.ollamaManager.notices.enterName'));
						return;
					}
					await this.pullModel(modelName, button.buttonEl);
				}));
	}

	private renderInstalledModels(containerEl: HTMLElement) {
		const section = containerEl.createDiv('ia-modal-section');
		const header = section.createDiv('ia-modal-section-header');

		new Setting(header).setName(t('modals.ollamaManager.installedTitle')).setHeading();

		const refreshBtn = header.createEl('button', { text: t('modals.ollamaManager.refreshList') });
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
				text: t('modals.ollamaManager.noModels'),
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
				text: t('modals.ollamaManager.capabilities', { caps: capabilities }),
				cls: 'ia-model-capabilities'
			});

			const deleteBtn = modelRow.createEl('button', { text: t('modals.ollamaManager.deleteBtn') });
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
			new Notice(t('modals.ollamaManager.notices.pulling', { name: modelName }));
			await this.admin.pull(this.baseUrl, modelName);
			new Notice(t('modals.ollamaManager.notices.pullSuccess', { name: modelName }));
			await this.refreshModelList();
		} catch (error) {
			console.error('Failed to pull model:', error);
			new Notice(t('modals.ollamaManager.notices.pullFailed', { message: errorMessage(error) }));
		} finally {
			(buttonEl as HTMLButtonElement).disabled = false;
			buttonEl.textContent = _originalText;
		}
	}
	
	private async confirmDelete(message: string): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText(t('modals.ollamaManager.confirmDelete.title'));
			const { contentEl } = modal;
			contentEl.empty();
			contentEl.createEl('p', { text: message });

			const buttonBar = contentEl.createDiv('ia-confirm-button-bar');

			const cancelBtn = buttonBar.createEl('button', { text: t('modals.ollamaManager.confirmDelete.cancel') });
			cancelBtn.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});

			const confirmBtn = buttonBar.createEl('button', { text: t('modals.ollamaManager.confirmDelete.confirm') });
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
		const confirmed = await this.confirmDelete(t('modals.ollamaManager.confirmDelete.message', { name: modelName }));
		if (!confirmed) {
			return;
		}

		const _originalText = buttonEl.textContent;
		buttonEl.textContent = 'Deleting...';
		(buttonEl as HTMLButtonElement).disabled = true;

		try {
			await this.admin.remove(this.baseUrl, modelName);
			new Notice(t('modals.ollamaManager.notices.deleted', { name: modelName }));
			await this.refreshModelList();
		} catch (error) {
			console.error('Failed to delete model:', error);
			new Notice(t('modals.ollamaManager.notices.deleteFailed', { message: errorMessage(error) }));
		} finally {
			(buttonEl as HTMLButtonElement).disabled = false;
			buttonEl.textContent = _originalText;
		}
	}

	private async refreshModelList(buttonEl?: HTMLElement) {
		let originalText: string | null = null;
		if (buttonEl) {
			originalText = buttonEl.textContent;
			buttonEl.textContent = t('modals.ollamaManager.notices.refreshing');
			(buttonEl as HTMLButtonElement).disabled = true;
		}

		try {
			const { ModelManager } = await import('@qwai/obsidian-llm');
			const models = await ModelManager.getModelsForConfig(this.config, true);
			this.config.cachedModels = models;
			this.config.cacheTimestamp = Date.now();
			this.models = models;

			// Re-render the modal
			this.contentEl.empty();
			this.onOpen();

			// Notify parent to save and refresh
			this.onUpdate();

			new Notice(t('modals.ollamaManager.notices.refreshSuccess'));
		} catch (_error) {
			console.error('Failed to refresh models:', _error);
			new Notice(t('modals.ollamaManager.notices.refreshFailed'));
		} finally {
			if (buttonEl) {
				(buttonEl as HTMLButtonElement).disabled = false;
				buttonEl.textContent = originalText ?? t('modals.ollamaManager.refreshList');
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
