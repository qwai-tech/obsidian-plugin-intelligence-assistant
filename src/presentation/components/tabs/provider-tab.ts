/**
 * Provider Settings Tab
 * Displays LLM provider management and configuration
 */

import { App, Notice, requestUrl } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { LLMConfig } from '@/types';
import { createTable } from '@/presentation/utils/ui-helpers';
import { ProviderConfigModal, OllamaModelManagerModal } from '../modals';
import { getProviderMeta } from '../components/provider-meta';

/**
 * Check Ollama server status
 */
async function checkOllamaStatus(baseUrl: string): Promise<{ online: boolean; version?: string }> {
	try {
		const url = baseUrl.endsWith('/') ? `${baseUrl}api/version` : `${baseUrl}/api/version`;
		const response = await requestUrl({
			url,
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
			throw: false,
		});

		if (response.status === 200) {
			const data = response.json as { version?: string };
			return { online: true, version: data.version };
		}
		return { online: false };
	} catch (_error) {
		return { online: false };
	}
}

export function displayProviderTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'Provider configuration' });

	const desc = containerEl.createEl('p', {
		text: 'Manage LLM providers and API credentials. Use the actions column to edit configuration details or refresh cached models.'
	});
	desc.addClass('ia-section-description');

	const actionsRow = containerEl.createDiv('ia-section-actions');
	const summary = actionsRow.createDiv('ia-section-summary');
	summary.createSpan({ text: `${plugin.settings.llmConfigs.length} provider${plugin.settings.llmConfigs.length === 1 ? '' : 's'} configured` });

	const addBtn = actionsRow.createEl('button', { text: '+ Add provider' });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		const draft: LLMConfig = {
			provider: 'openai',
			apiKey: '',
			baseUrl: '',
			cachedModels: []
		};
		new ProviderConfigModal(app, draft, async (updated) => {
			plugin.settings.llmConfigs.push(updated);
			await plugin.saveSettings();
			refreshDisplay();
		}).open();
	});

	if (plugin.settings.llmConfigs.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No providers configured. Select "Add provider" to get started.');
		return;
	}

	const table = createTable(containerEl, ['Provider', 'Status', 'Actions']);
	const tbody = table.tBodies[0];

	plugin.settings.llmConfigs.forEach((config, index) => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		const providerCell = row.insertCell();
		providerCell.addClass('ia-table-cell');
		const providerStack = providerCell.createDiv('ia-table-stack');
		const providerMeta = getProviderMeta(config.provider);
		const providerHeader = providerStack.createDiv('ia-provider-header');
		if (providerMeta.iconSvg) {
			const iconContainer = providerHeader.createDiv('ia-provider-icon');
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(providerMeta.iconSvg, 'image/svg+xml');
			const svgElement = svgDoc.documentElement;
			if (svgElement instanceof SVGElement) {
				iconContainer.appendChild(svgElement);
			}
		}
		const providerName = providerHeader.createDiv('ia-provider-name');
		providerName.setText(providerMeta.label);

		// For Ollama, add a version placeholder that will be updated
		let versionEl: HTMLElement | null = null;
		if (config.provider === 'ollama') {
			versionEl = providerStack.createDiv('ia-table-subtext');
			versionEl.setText('Checking version...');
			versionEl.setCssProps({ 'font-style': 'italic' });
		}

		if (config.baseUrl) {
			const url = providerStack.createDiv('ia-table-subtext');
			url.addClass('ia-code');
			url.setText(config.baseUrl);
		}

		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		const statusStack = statusCell.createDiv('ia-table-stack');

		const modelCount = config.cachedModels?.length ?? 0;
		const hasModels = modelCount > 0;
		let hasCredentials = false;
		let guidance = '';

		switch (config.provider) {
			case 'sap-ai-core':
				hasCredentials = Boolean(config.serviceKey);
				guidance = 'Provide service key';
				break;
			case 'ollama':
				hasCredentials = Boolean(config.baseUrl);
				guidance = 'Configure base URL';
				break;
			default:
				hasCredentials = Boolean(config.apiKey);
				guidance = 'Add API key';
				break;
		}

		let statusLabel = 'Needs Configuration';
		let statusClass = 'is-danger';
		const modelSummary = hasModels ? `${modelCount} model${modelCount === 1 ? '' : 's'}` : 'No models';

		if (hasCredentials && hasModels) {
			statusLabel = 'Ready';
			statusClass = 'is-success';
		} else if (hasCredentials) {
			// For Ollama, show "Checking..." initially since we'll check server status
			if (config.provider === 'ollama') {
				statusLabel = 'Checking...';
				statusClass = 'is-warning';
			} else {
				statusLabel = 'Credentials Set';
				statusClass = 'is-warning';
			}
		}

		const statusBadge = statusStack.createDiv('ia-status-badge');
		statusBadge.addClass(statusClass);
		statusBadge.setText(statusLabel);

		// Model count line
		const infoLine = statusStack.createDiv('ia-table-subtext');
		if (!hasCredentials) {
			infoLine.setText(`${modelSummary} • ${guidance}`);
		} else {
			infoLine.setText(modelSummary);
		}

		// For Ollama, check server connectivity
		if (config.provider === 'ollama' && config.baseUrl) {
			const serverStatusLine = statusStack.createDiv('ia-table-subtext');
			serverStatusLine.setText('Checking server...');
			serverStatusLine.setCssProps({ 'font-style': 'italic' });

			// Check Ollama server status
			checkOllamaStatus(config.baseUrl).then((status) => {
				if (status.online) {
					serverStatusLine.setText(`Server: online`);
					serverStatusLine.setCssProps({ 'color': 'var(--text-success)' });
					serverStatusLine.setCssProps({ 'font-style': 'normal' });

					// Update version in provider cell
					if (versionEl && status.version) {
						versionEl.setText(`Version: ${status.version}`);
						versionEl.setCssProps({ 'font-style': 'normal' });
						versionEl.setCssProps({ 'color': 'var(--text-muted)' });
					}

					// Update status badge if server is online
					if (hasModels) {
						statusBadge.removeClass('is-warning');
						statusBadge.addClass('is-success');
						statusBadge.setText('Ready');
					} else {
						statusBadge.removeClass('is-danger');
						statusBadge.addClass('is-warning');
						statusBadge.setText('Server online');
					}
				} else {
					serverStatusLine.setText(`Server: offline or unreachable`);
					serverStatusLine.setCssProps({ 'color': 'var(--text-error)' });
					serverStatusLine.setCssProps({ 'font-style': 'normal' });

					// Update version display
					if (versionEl) {
						versionEl.setText('Server offline');
						versionEl.setCssProps({ 'color': 'var(--text-error)' });
						versionEl.setCssProps({ 'font-style': 'normal' });
					}

					// Update status to show server is offline
					statusBadge.removeClass('is-success');
					statusBadge.removeClass('is-warning');
					statusBadge.addClass('is-danger');
					statusBadge.setText('Server offline');
				}
			}).catch(() => {
				serverStatusLine.setText('Server: connection error');
				serverStatusLine.setCssProps({ 'color': 'var(--text-error)' });

				if (versionEl) {
					versionEl.setText('Connection error');
					versionEl.setCssProps({ 'color': 'var(--text-error)' });
					versionEl.setCssProps({ 'font-style': 'normal' });
				}
			});
		}

		// Last refresh line (separate, simpler format)
		const refreshLine = statusStack.createDiv('ia-table-subtext');
		if (config.cacheTimestamp) {
			const date = new Date(config.cacheTimestamp);
			const now = new Date();
			const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

			let timeAgo: string;
			if (diffMinutes < 1) {
				timeAgo = 'just now';
			} else if (diffMinutes < 60) {
				timeAgo = `${diffMinutes}m ago`;
			} else if (diffMinutes < 1440) {
				const hours = Math.floor(diffMinutes / 60);
				timeAgo = `${hours}h ago`;
			} else {
				const days = Math.floor(diffMinutes / 1440);
				timeAgo = `${days}d ago`;
			}
			refreshLine.setText(`Last refresh: ${timeAgo}`);
		} else {
			refreshLine.setText('Never refreshed');
		}

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: 'Edit' });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			const draft = JSON.parse(JSON.stringify(config)) as LLMConfig;
			new ProviderConfigModal(app, draft, async (updated) => {
				plugin.settings.llmConfigs[index] = updated;
				await plugin.saveSettings();
				refreshDisplay();
			}).open();
		});

		// For Ollama, add "Manage Models" button instead of just "Refresh Models"
		if (config.provider === 'ollama') {
			const manageBtn = actionsCell.createEl('button', { text: 'Manage models' });
			manageBtn.addClass('ia-button');
			manageBtn.addClass('ia-button--ghost');
			manageBtn.addEventListener('click', () => {
				new OllamaModelManagerModal(app, config, () => {
					void (async () => {
						await plugin.saveSettings();
						refreshDisplay();
					})();
				}).open();
			});
		} else {
		const refreshBtn = actionsCell.createEl('button', { text: 'Refresh models' });
		refreshBtn.addClass('ia-button');
		refreshBtn.addClass('ia-button--ghost');
		refreshBtn.addEventListener('click', () => {
			void (async () => {
				refreshBtn.textContent = 'Refreshing...';
				refreshBtn.disabled = true;
				try {
					const { ModelManager } = await import('@/infrastructure/llm/model-manager');
					const models = await ModelManager.getModelsForConfig(config, true);
					config.cachedModels = models;
					config.cacheTimestamp = Date.now();
					await plugin.saveSettings();
					new Notice(`Models refreshed for ${config.provider}.`);
					refreshDisplay();
				} catch (_error) {
					console.error('Failed to refresh models', _error);
					new Notice('Failed to refresh models');
				} finally {
					refreshBtn.disabled = false;
					refreshBtn.textContent = 'Refresh models';
				}
			})();
		});
		}

		const deleteBtn = actionsCell.createEl('button', { text: 'Delete' });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (await showConfirm(app, `Remove provider ${config.provider}?`)) {
					plugin.settings.llmConfigs.splice(index, 1);
					await plugin.saveSettings();
					refreshDisplay();
				}
			})();
		});
	});
}
