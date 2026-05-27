/**
 * Provider Settings Tab
 * Displays LLM provider management and configuration
 */

import { App, Notice, requestUrl } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import type IntelligenceAssistantPlugin from '@plugin';
import type { LLMConfig } from '@/types';
import { t } from '@/i18n';
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
	} catch (error) {
		console.error('Failed to check Ollama status:', error);
		return { online: false };
	}
}

export function displayProviderTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	app: App,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: t('settings.provider.title') });

	// Security Warning
	const warningContainer = containerEl.createDiv('ia-warning-box');

	const warningTitle = warningContainer.createDiv('ia-warning-title');
	warningTitle.createSpan({ text: t('settings.provider.securityTitle') });

	const warningText = warningContainer.createDiv('ia-warning-text');
	warningText.setText(t('settings.provider.securityDesc'));

	const warningList = warningContainer.createEl('ul', { cls: 'ia-warning-list' });
	warningList.createEl('li', { text: t('settings.provider.securityItem1', { configDir: app.vault.configDir }) });
	warningList.createEl('li', { text: t('settings.provider.securityItem2') });
	warningList.createEl('li', { text: t('settings.provider.securityItem3') });

	const desc = containerEl.createEl('p', {
		text: t('settings.provider.desc')
	});
	desc.addClass('ia-section-description');

	const actionsRow = containerEl.createDiv('ia-section-actions');
	const summary = actionsRow.createDiv('ia-section-summary');
	summary.createSpan({ text: t('settings.provider.count', { count: plugin.settings.llmConfigs.length }) });

	const addBtn = actionsRow.createEl('button', { text: t('settings.provider.addBtn') });
	addBtn.addClass('ia-button');
	addBtn.addClass('ia-button--primary');
	addBtn.addEventListener('click', () => {
		const draft: LLMConfig = {
			provider: '',
			apiKey: '',
			baseUrl: '',
			cachedModels: []
		};
		new ProviderConfigModal(app, draft, async (updated) => {
			plugin.settings.llmConfigs.push(updated);
			await plugin.saveSettings();
			await plugin.refreshChatViewsModels();
			refreshDisplay();
		}).open();
	});

	if (plugin.settings.llmConfigs.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.provider.empty'));
		return;
	}

	const table = createTable(containerEl, [t('settings.provider.tableHeaders.provider'), t('settings.provider.tableHeaders.status'), t('settings.provider.tableHeaders.actions')]);
	const tbody = table.tBodies[0];

	plugin.settings.llmConfigs.forEach((config, index) => {
		// Normalize Ollama base URL to default if missing (helps with status detection)
		const ollamaBaseUrl = config.provider === 'ollama'
			? (config.baseUrl && config.baseUrl.trim() !== '' ? config.baseUrl.trim() : 'http://localhost:11434')
			: undefined;

		const row = tbody.insertRow();
		row.addClass('ia-table-row');
		row.addClass('provider-row'); // Add for test compatibility

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
		// Create span with ia-provider-name class for test compatibility
		const providerNameSpan = providerHeader.createSpan();
		providerNameSpan.addClass('ia-provider-name');
		providerNameSpan.setText(providerMeta.label);

		// For Ollama, add a version placeholder that will be updated
		let versionEl: HTMLElement | null = null;
		if (config.provider === 'ollama') {
			versionEl = providerStack.createDiv('ia-table-subtext');
			versionEl.setText(t('settings.provider.ollama.checkingVersion'));
			versionEl.addClass('ia-text-italic');
		}

		const urlToShow = config.provider === 'ollama' ? (ollamaBaseUrl ?? '') : config.baseUrl;
		if (urlToShow) {
			const url = providerStack.createDiv('ia-table-subtext');
			url.addClass('ia-code');
			url.setText(urlToShow);
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
				guidance = t('settings.provider.guidance.provideServiceKey');
				break;
			case 'ollama':
				hasCredentials = Boolean(ollamaBaseUrl);
				guidance = t('settings.provider.guidance.configureBaseUrl');
				break;
			default:
				hasCredentials = Boolean(config.apiKey);
				guidance = t('settings.provider.guidance.addApiKey');
				break;
		}

		let statusLabel = t('settings.provider.status.needsConfig');
		let statusClass = 'is-danger';
		const modelSummary = hasModels ? t('settings.provider.models.count', { count: modelCount }) : t('settings.provider.models.none');

		if (hasCredentials && hasModels) {
			statusLabel = t('settings.provider.status.ready');
			statusClass = 'is-success';
		} else if (hasCredentials) {
			// For Ollama, show "Checking..." initially since we'll check server status
			if (config.provider === 'ollama') {
				statusLabel = t('settings.provider.status.checking');
				statusClass = 'is-warning';
			} else {
				statusLabel = t('settings.provider.status.credentialsSet');
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
		if (config.provider === 'ollama' && ollamaBaseUrl) {
			const serverStatusLine = statusStack.createDiv('ia-table-subtext');
			serverStatusLine.setText(t('settings.provider.ollama.server.checking'));
			serverStatusLine.addClass('ia-text-italic');

			// Check Ollama server status
			checkOllamaStatus(ollamaBaseUrl).then((status) => {
				if (status.online) {
					serverStatusLine.setText(t('settings.provider.ollama.server.online'));
					serverStatusLine.removeClass('ia-text-italic');
					serverStatusLine.addClass('ia-text-success');

					// Update version in provider cell
					if (versionEl && status.version) {
						versionEl.setText(t('settings.provider.ollama.server.version', { version: status.version }));
						versionEl.removeClass('ia-text-italic');
						versionEl.addClass('ia-text-muted');
					} else if (versionEl) {
						versionEl.setText(t('settings.provider.ollama.server.versionOnline'));
						versionEl.removeClass('ia-text-italic');
						versionEl.addClass('ia-text-muted');
					}

					// Update status badge if server is online
					if (hasModels) {
						statusBadge.removeClass('is-warning');
						statusBadge.addClass('is-success');
						statusBadge.setText(t('settings.provider.status.ready'));
					} else {
						statusBadge.removeClass('is-danger');
						statusBadge.addClass('is-warning');
						statusBadge.setText(t('settings.provider.status.serverOnline'));
					}
				} else {
					serverStatusLine.setText(t('settings.provider.ollama.server.offline'));
					serverStatusLine.removeClass('ia-text-italic');
					serverStatusLine.addClass('ia-text-error');

					// Update version display
					if (versionEl) {
						versionEl.setText(t('settings.provider.ollama.server.versionOffline'));
						versionEl.removeClass('ia-text-italic');
						versionEl.addClass('ia-text-error');
					}

					// Update status to show server is offline
					statusBadge.removeClass('is-success');
					statusBadge.removeClass('is-warning');
					statusBadge.addClass('is-danger');
					statusBadge.setText(t('settings.provider.status.serverOffline'));
				}
			}).catch(() => {
				serverStatusLine.setText(t('settings.provider.ollama.server.error'));
				serverStatusLine.removeClass('ia-text-italic');
				serverStatusLine.addClass('ia-text-error');

				if (versionEl) {
					versionEl.setText(t('settings.provider.ollama.server.versionError'));
					versionEl.removeClass('ia-text-italic');
					versionEl.addClass('ia-text-error');
				}
				// Keep status badge consistent with failure
				statusBadge.removeClass('is-success');
				statusBadge.removeClass('is-warning');
				statusBadge.addClass('is-danger');
				statusBadge.setText(t('settings.provider.status.serverError'));
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
				timeAgo = t('settings.provider.refresh.justNow');
			} else if (diffMinutes < 60) {
				timeAgo = t('settings.provider.refresh.minutesAgo', { n: diffMinutes });
			} else if (diffMinutes < 1440) {
				const hours = Math.floor(diffMinutes / 60);
				timeAgo = t('settings.provider.refresh.hoursAgo', { n: hours });
			} else {
				const days = Math.floor(diffMinutes / 1440);
				timeAgo = t('settings.provider.refresh.daysAgo', { n: days });
			}
			refreshLine.setText(t('settings.provider.refresh.lastRefresh', { timeAgo }));
		} else {
			refreshLine.setText(t('settings.provider.refresh.neverRefreshed'));
		}

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const editBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.edit') });
		editBtn.addClass('ia-button');
		editBtn.addClass('ia-button--ghost');
		editBtn.addEventListener('click', () => {
			const draft = JSON.parse(JSON.stringify(config)) as LLMConfig;
			new ProviderConfigModal(app, draft, async (updated) => {
				plugin.settings.llmConfigs[index] = updated;
				await plugin.saveSettings();
				await plugin.refreshChatViewsModels();
				refreshDisplay();
			}).open();
		});

		// For Ollama, add "Manage Models" button instead of just "Refresh Models"
		if (config.provider === 'ollama') {
			const manageBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.manageModels') });
			manageBtn.addClass('ia-button');
			manageBtn.addClass('ia-button--ghost');
			manageBtn.addEventListener('click', () => {
				new OllamaModelManagerModal(app, config, () => {
					void (async () => {
						await plugin.saveSettings();
						await plugin.refreshChatViewsModels();
						refreshDisplay();
					})();
				}).open();
			});
		} else {
		const refreshBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.refreshModels') });
		refreshBtn.addClass('ia-button');
		refreshBtn.addClass('ia-button--ghost');
		refreshBtn.addEventListener('click', () => {
			void (async () => {
				refreshBtn.textContent = t('settings.provider.actions.refreshing');
				refreshBtn.disabled = true;
				try {
					const { ModelManager } = await import('@/infrastructure/llm/model-manager');
					const models = await ModelManager.getModelsForConfig(config, true);
					config.cachedModels = models;
					config.cacheTimestamp = Date.now();
					await plugin.saveSettings();
					await plugin.refreshChatViewsModels();
					new Notice(t('settings.provider.notices.refreshed', { provider: config.provider }));
					refreshDisplay();
				} catch (_error) {
					console.error('Failed to refresh models', _error);
					new Notice(t('settings.provider.notices.refreshFailed'));
				} finally {
					refreshBtn.disabled = false;
					refreshBtn.textContent = t('settings.provider.actions.refreshModels');
				}
			})();
		});
		}

		const deleteBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.delete') });
		deleteBtn.addClass('ia-button');
		deleteBtn.addClass('ia-button--danger');
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				if (await showConfirm(app, t('settings.provider.confirm.delete', { provider: config.provider }))) {
					plugin.settings.llmConfigs.splice(index, 1);
					await plugin.saveSettings();
					await plugin.refreshChatViewsModels();
					refreshDisplay();
				}
			})();
		});
	});
}
