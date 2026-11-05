import { notify } from '@/core/notifications';
/**
 * Models Settings Tab
 * Displays model configuration and management
 */


import type { PluginHost } from '@/ui/plugin-host';
import { defaultAfterRefresh, type ModelInfo, type ModelCapability } from '@/features/llm';
import { t } from '@/i18n';
import { createTable } from '@/ui/utils/ui-helpers';
import { getProviderMeta } from '@/ui/provider-meta';
import { connectionLabel } from '@qwai/obsidian-llm';
import { describeConnectionError } from '@/ui/modals/connection-error';

const refreshFeedback = new WeakMap<PluginHost, { message: string; details: string[] }>();

export interface ModelFilters {
	providerFilter: string;
	capabilityFilter: string;
	enabledFilter: 'all' | 'enabled' | 'disabled';
	searchTerm: string;
}

export function displayModelsTab(
	containerEl: HTMLElement,
	plugin: PluginHost,
	filters: ModelFilters,
	onFilterChange: (filters: Partial<ModelFilters>) => void,
	refreshDisplay: () => void
): void {

	const desc = containerEl.createEl('p', {
		text: t('settings.models.desc')
	});
	desc.addClass('ia-section-description');

	const controls = containerEl.createDiv('ia-section-actions');
	controls.addClass('ia-section-actions--wrap');
	const summary = controls.createDiv('ia-section-summary');
	summary.createSpan({ text: t('settings.models.providerCount', { count: plugin.settings.llmConfigs.length }) });
	const previousFeedback = refreshFeedback.get(plugin);
	if (previousFeedback) {
		const feedback = containerEl.createDiv('ia-operation-feedback');
		feedback.setAttribute('role', 'status');
		feedback.createEl('p', { text: previousFeedback.message });
		for (const detail of previousFeedback.details) feedback.createEl('p', { text: detail, cls: 'ia-operation-error' });
	}

	// Add refresh all button
	const refreshAllBtn = controls.createEl('button', { text: t('settings.models.refreshAll') });
	refreshAllBtn.addClass('ia-button');
	refreshAllBtn.addClass('ia-button--ghost');
	refreshAllBtn.addEventListener('click', () => {
		void (async () => {
			refreshAllBtn.textContent = t('settings.models.refreshing');
			refreshAllBtn.disabled = true;

			try {
			const { ModelManager } = await import('@qwai/obsidian-llm');

			const refreshed = new Map<number, Awaited<ReturnType<typeof ModelManager.getModelsForConfig>>>();
			const failures: string[] = [];
			const before = new Map(plugin.settings.llmConfigs.map((config, index) => [index, [...(config.cachedModels ?? [])]]));
			for (const [index, config] of plugin.settings.llmConfigs.entries()) {
				try {
					notify(t('settings.models.notices.fetching', { provider: connectionLabel(config) }), 0, 'models-refresh');
					refreshed.set(index, await ModelManager.getModelsForConfig(config, true));
				} catch (error) {
					console.error(`Failed to refresh models for ${config.provider}:`, error);
					const { key, status } = describeConnectionError(error);
					failures.push(`${connectionLabel(config)}: ${t(`modals.provider.connectionErrors.${key}`, { status })}`);
				}
			}

			await plugin.updateSettings((settings) => {
				for (const [index, models] of refreshed) {
					settings.defaultModel = defaultAfterRefresh(settings.defaultModel, before.get(index) ?? [], models);
					settings.llmConfigs[index].cachedModels = models;
					settings.llmConfigs[index].cacheTimestamp = Date.now();
				}
			});
			const message = failures.length === 0 ? t('settings.models.notices.refreshed')
				: refreshed.size === 0 ? t('settings.models.notices.refreshFailed')
					: t('ux.modelsRefreshPartial', { success: refreshed.size, failed: failures.length });
			refreshFeedback.set(plugin, { message, details: failures });
			notify(message, 5000, 'models-refresh');

			// Redisplay the tab
			refreshDisplay();
		} catch (error) {
			console.error('Failed to refresh models:', error);
			refreshFeedback.set(plugin, { message: t('settings.models.notices.refreshFailed'), details: [] });
			notify(t('settings.models.notices.refreshFailed'), 5000, 'models-refresh');
			refreshDisplay();
		} finally {
			refreshAllBtn.disabled = false;
			refreshAllBtn.textContent = t('settings.models.refreshAll');
			}
		})();
	});

	// Show message if no providers configured
	if (plugin.settings.llmConfigs.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.models.empty'));
		return;
	}

	// Collect all models from configured providers
	const allModels: Array<{ provider: string; model: ModelInfo }> = [];
	const capabilitySet = new Set<ModelCapability>();
	for (const config of plugin.settings.llmConfigs) {
		if (config.cachedModels) {
			for (const model of config.cachedModels) {
				allModels.push({ provider: config.provider, model });
				for (const cap of model.capabilities ?? []) {
					capabilitySet.add(cap);
				}
			}
		}
	}

	renderModelFilters(controls, plugin, Array.from(capabilitySet), filters, onFilterChange, refreshDisplay);

	const filteredModels = applyModelFilters(allModels, filters);

	summary.createSpan({ text: t('settings.models.modelCount', { count: allModels.length }) }).addClass('ia-section-summary-pill');
	if (filteredModels.length !== allModels.length) {
		summary.createSpan({ text: t('settings.models.matchCount', { count: filteredModels.length }) }).addClass('ia-section-summary-pill');
	}

	if (allModels.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.models.noModels'));
		return;
	}

	if (filteredModels.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText(t('settings.models.noMatch'));
		return;
	}

	const table = createTable(containerEl, [
		t('settings.models.tableHeaders.model'),
		t('settings.models.tableHeaders.capabilities'),
		t('settings.models.tableHeaders.status'),
		t('settings.models.tableHeaders.actions'),
	]);
	const tbody = table.tBodies[0];

	filteredModels.forEach(({ provider, model }) => {
		const row = tbody.insertRow();
		row.addClass('ia-table-row');

		const modelCell = row.insertCell();
		modelCell.addClass('ia-table-cell');

		const modelStack = modelCell.createDiv('ia-table-stack');
		const providerMeta = getProviderMeta(provider);
		const modelHeader = modelStack.createDiv('ia-provider-header');
		if (providerMeta.iconSvg) {
			const iconContainer = modelHeader.createDiv('ia-provider-icon');
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(providerMeta.iconSvg, 'image/svg+xml');
			const svgElement = svgDoc.documentElement;
			if (svgElement.instanceOf(SVGElement)) {
				iconContainer.appendChild(svgElement);
			}
		}
		const modelNameEl = modelHeader.createDiv('ia-provider-name');
		modelNameEl.setText(model.name);

		const metaRow = modelStack.createDiv('ia-model-meta');
		const providerLabel = metaRow.createSpan();
		providerLabel.addClass('ia-table-subtext');
		providerLabel.setText(model.providerLabel || providerMeta.label);
		const details = modelStack.createEl('details');
		details.createEl('summary', { text: t('ux.modelId') });
		const idSpan = details.createSpan();
		idSpan.addClass('ia-code');
		idSpan.setText(model.id);

		const capsCell = row.insertCell();
		capsCell.addClass('ia-table-cell');
		const capsDiv = capsCell.createDiv('ia-table-badges');

		const capabilityColors: Record<string, string> = {
			'chat': '#4CAF50',
			'vision': '#2196F3',
			'audio': '#FF9800',
			'video': '#9C27B0',
			'function_calling': '#00BCD4',
			'streaming': '#8BC34A',
			'json_mode': '#FFC107',
			'reasoning': '#E91E63',
			'embedding': '#607D8B',
			'computer_use': '#795548',
			'multimodal_output': '#3F51B5',
			'code_execution': '#009688'
		};

		(model.capabilities ?? []).forEach(cap => {
			const badge = capsDiv.createEl('span', { text: cap });
			badge.addClass('ia-tag');
			badge.addClass('ia-tag--dyn-bg');
			badge.setCssProps({ '--ia-badge-bg': capabilityColors[cap] || 'var(--background-modifier-border)' });
		});

		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		const statusStack = statusCell.createDiv('ia-table-stack');
		const statusBadge = statusStack.createDiv('ia-status-badge');
		statusBadge.addClass(model.enabled ? 'is-success' : 'is-danger');
		statusBadge.setText(model.enabled ? t('settings.models.status.enabled') : t('settings.models.status.disabled'));

		const statusDetails: string[] = [];
		const isDefaultChat = plugin.settings.defaultModel === model.id;
		const embeddingDefaultId = plugin.settings.ragConfig?.embeddingModel;
		const isDefaultEmbedding = embeddingDefaultId === model.id;
		if (isDefaultChat) {
			statusDetails.push('Default chat model');
		}
		if (isDefaultEmbedding) {
			statusDetails.push('Default embedding model');
		}
		if (statusDetails.length > 0) {
			statusStack.createDiv('ia-table-subtext').setText(statusDetails.join(' • '));
		}

		const actionsCell = row.insertCell();
		actionsCell.addClass('ia-table-cell');
		actionsCell.addClass('ia-table-actions');

		const toggleBtn = actionsCell.createEl('button', { text: model.enabled ? t('settings.models.actions.disable') : t('settings.models.actions.enable') });
		toggleBtn.addClass('ia-button');
		toggleBtn.addClass(model.enabled ? 'ia-button--ghost' : 'ia-button--primary');
		toggleBtn.addEventListener('click', () => {
			void (async () => {
				await plugin.updateSettings(() => {
					model.enabled = !model.enabled;
				});
				refreshDisplay();
			})();
		});

		if ((model.capabilities ?? []).includes('chat')) {
			const chatBtn = actionsCell.createEl('button', { text: isDefaultChat ? t('settings.models.actions.defaultChat') : t('settings.models.actions.setDefaultChat') });
			chatBtn.addClass('ia-button');
			chatBtn.addClass(isDefaultChat ? 'ia-button--success' : 'ia-button--ghost');
			if (isDefaultChat) {
				chatBtn.disabled = true;
			} else {
				chatBtn.addEventListener('click', () => {
					void (async () => {
						await plugin.updateSettings((settings) => {
							settings.defaultModel = model.id;
						});
						notify(t('settings.models.notices.defaultChatSet', { name: `${model.name} · ${model.providerLabel || providerMeta.label}` }));
						refreshDisplay();
					})();
				});
			}
		}

		if ((model.capabilities ?? []).includes('embedding') && plugin.settings.ragConfig) {
			const embeddingBtn = actionsCell.createEl('button', { text: isDefaultEmbedding ? t('settings.models.actions.defaultEmbedding') : t('settings.models.actions.setDefaultEmbedding') });
			embeddingBtn.addClass('ia-button');
			embeddingBtn.addClass(isDefaultEmbedding ? 'ia-button--success' : 'ia-button--ghost');
			if (isDefaultEmbedding) {
				embeddingBtn.disabled = true;
			} else {
				embeddingBtn.addEventListener('click', () => {
					void (async () => {
						await plugin.updateSettings((settings) => {
							settings.ragConfig.embeddingModel = model.id;
						});
						notify(t('settings.models.notices.defaultEmbeddingSet', { name: model.name }));
						refreshDisplay();
					})();
				});
			}
		}
	});
}

function renderModelFilters(
	parent: HTMLElement,
	plugin: PluginHost,
	capabilities: ModelCapability[],
	filters: ModelFilters,
	onFilterChange: (filters: Partial<ModelFilters>) => void,
	refreshDisplay: () => void
): void {
	const filterBar = parent.createDiv('ia-filter-bar');
	const field = (label: string) => {
		const wrapper = filterBar.createEl('label', { cls: 'ia-filter-field' });
		wrapper.createSpan({ text: label, cls: 'ia-filter-label' });
		return wrapper;
	};

	const providerSelect = field(t('settings.usage.tableHeaders.provider')).createEl('select');
	providerSelect.addClass('ia-filter-control');
	providerSelect.addClass('ia-filter-control--compact');
	providerSelect.createEl('option', { value: 'all', text: t('settings.models.filters.allProviders') });

	const providerIds = Array.from(new Set(plugin.settings.llmConfigs.map(({ provider }) => provider)));
	providerIds.sort((a, b) => getProviderMeta(a).label.localeCompare(getProviderMeta(b).label));

	providerIds.forEach(providerId => {
		providerSelect.createEl('option', { value: providerId, text: getProviderMeta(providerId).label });
	});

	if (filters.providerFilter !== 'all' && !providerIds.includes(filters.providerFilter)) {
		onFilterChange({ providerFilter: 'all' });
	}

	providerSelect.value = filters.providerFilter;
	providerSelect.addEventListener('change', (event: Event) => {
		onFilterChange({ providerFilter: (event.target as HTMLSelectElement).value });
		refreshDisplay();
	});

	const capabilitySelect = field(t('settings.models.tableHeaders.capabilities')).createEl('select');
	capabilitySelect.addClass('ia-filter-control');
	capabilitySelect.addClass('ia-filter-control--compact');
	capabilitySelect.createEl('option', { value: 'all', text: t('settings.models.filters.allCapabilities') });

	const capabilityOptions = Array.from(new Set(capabilities)).sort((a, b) => a.localeCompare(b));
	capabilityOptions.forEach(capability => {
		capabilitySelect.createEl('option', { value: capability, text: capability.replace(/_/g, ' ') });
	});

	if (filters.capabilityFilter !== 'all' && !capabilityOptions.includes(filters.capabilityFilter as ModelCapability)) {
		onFilterChange({ capabilityFilter: 'all' });
	}

	capabilitySelect.value = filters.capabilityFilter;
	capabilitySelect.addEventListener('change', (event: Event) => {
		onFilterChange({ capabilityFilter: (event.target as HTMLSelectElement).value });
		refreshDisplay();
	});

	const statusSelect = field(t('settings.models.tableHeaders.status')).createEl('select');
	statusSelect.addClass('ia-filter-control');
	statusSelect.addClass('ia-filter-control--compact');
	statusSelect.createEl('option', { value: 'all', text: t('settings.models.filters.allStates') });
	statusSelect.createEl('option', { value: 'enabled', text: t('settings.models.status.enabled') });
	statusSelect.createEl('option', { value: 'disabled', text: t('settings.models.status.disabled') });
	statusSelect.value = filters.enabledFilter;
	statusSelect.addEventListener('change', (event: Event) => {
		onFilterChange({ enabledFilter: (event.target as HTMLSelectElement).value as 'all' | 'enabled' | 'disabled' });
		refreshDisplay();
	});

	const searchField = field(t('settings.models.filters.searchPlaceholder'));
	searchField.addClass('ia-filter-field--search');
	const searchInput = searchField.createEl('input', { type: 'search', placeholder: t('settings.models.filters.searchPlaceholder') });
	searchInput.addClass('ia-filter-control');
	searchInput.addClass('ia-filter-search');
	searchInput.value = filters.searchTerm;
	searchInput.addEventListener('input', (event: Event) => {
		onFilterChange({ searchTerm: (event.target as HTMLInputElement).value });
		refreshDisplay();
	});
}

function applyModelFilters(
	models: Array<{ provider: string; model: ModelInfo }>,
	filters: ModelFilters
): Array<{ provider: string; model: ModelInfo }> {
	const searchTerm = filters.searchTerm.trim().toLowerCase();
	const capabilityFilter = filters.capabilityFilter;
	return models.filter(({ provider, model }) => {
		if (filters.providerFilter !== 'all' && provider !== filters.providerFilter) {
			return false;
		}

		if (capabilityFilter !== 'all' && !(model.capabilities ?? []).includes(capabilityFilter as ModelCapability)) {
			return false;
		}

		if (filters.enabledFilter === 'enabled' && !model.enabled) {
			return false;
		}

		if (filters.enabledFilter === 'disabled' && model.enabled) {
			return false;
		}

		if (searchTerm) {
			const providerMeta = getProviderMeta(provider);
			const haystack = [
				model.name.toLowerCase(),
				model.id.toLowerCase(),
				provider.toLowerCase(),
				providerMeta.label.toLowerCase(),
				(model.capabilities ?? []).join(' ').toLowerCase()
			];
			if (!haystack.some(value => value.includes(searchTerm))) {
				return false;
			}
		}

		return true;
	});
}
