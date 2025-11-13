/**
 * Models Settings Tab
 * Displays model configuration and management
 */

import { Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import type { ModelInfo, ModelCapability } from '@/types';
import { createTable } from '@/presentation/utils/ui-helpers';
import { getProviderMeta } from '../components/provider-meta';

export interface ModelFilters {
	providerFilter: string;
	capabilityFilter: string;
	enabledFilter: 'all' | 'enabled' | 'disabled';
	searchTerm: string;
}

export function displayModelsTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	filters: ModelFilters,
	onFilterChange: (filters: Partial<ModelFilters>) => void,
	refreshDisplay: () => void
): void {
	containerEl.createEl('h3', { text: 'Model Configuration' });

	const desc = containerEl.createEl('p', {
		text: 'View and manage models from all configured providers. Click "Refresh Models" to fetch the latest available models.'
	});
	desc.addClass('ia-section-description');

	const controls = containerEl.createDiv('ia-section-actions');
	controls.addClass('ia-section-actions--wrap');
	const summary = controls.createDiv('ia-section-summary');
	summary.createSpan({ text: `${plugin.settings.llmConfigs.length} provider${plugin.settings.llmConfigs.length === 1 ? '' : 's'} configured` });

	// Add refresh all button
	const refreshAllBtn = controls.createEl('button', { text: '🔄 Refresh All Models' });
	refreshAllBtn.addClass('ia-button');
	refreshAllBtn.addClass('ia-button--ghost');
	refreshAllBtn.addEventListener('click', async () => {
		refreshAllBtn.textContent = 'Refreshing...';
		refreshAllBtn.disabled = true;

		try {
			const { ModelManager } = await import('@/infrastructure/llm/model-manager');

			for (const config of plugin.settings.llmConfigs) {
				try {
					new Notice(`Fetching models for ${config.provider}...`);
					const models = await ModelManager.getModelsForConfig(config, true);
					config.cachedModels = models;
					config.cacheTimestamp = Date.now();
				} catch (error) {
					console.error(`Failed to refresh models for ${config.provider}:`, error);
					new Notice(`Failed to refresh ${config.provider} models`);
				}
			}

			await plugin.saveSettings();
			new Notice('Models refreshed successfully!');

			// Redisplay the tab
			refreshDisplay();
		} catch (error) {
			console.error('Failed to refresh models:', error);
			new Notice('Failed to refresh models');
		} finally {
			refreshAllBtn.disabled = false;
			refreshAllBtn.textContent = '🔄 Refresh All Models';
		}
	});

	// Show message if no providers configured
	if (plugin.settings.llmConfigs.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No providers configured yet. Add providers in the Provider tab first.');
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

	summary.createSpan({ text: `• ${allModels.length} model${allModels.length === 1 ? '' : 's'} cached` }).addClass('ia-section-summary-pill');
	if (filteredModels.length !== allModels.length) {
		summary.createSpan({ text: `• ${filteredModels.length} match${filteredModels.length === 1 ? '' : 'es'} selected filters` }).addClass('ia-section-summary-pill');
	}

	if (allModels.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No models available. Click "Refresh All Models" or refresh individual providers in the Provider tab.');
		return;
	}

	if (filteredModels.length === 0) {
		const emptyDiv = containerEl.createDiv('ia-empty-state');
		emptyDiv.setText('No models match the current filters. Adjust or clear filters to see results.');
		return;
	}

	const table = createTable(containerEl, ['Model', 'Capabilities', 'Status', 'Actions']);
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
			if (svgElement instanceof SVGElement) {
				iconContainer.appendChild(svgElement);
			}
		}
		const modelNameEl = modelHeader.createDiv('ia-provider-name');
		modelNameEl.setText(model.name);

		const metaRow = modelStack.createDiv('ia-model-meta');
		const providerLabel = metaRow.createSpan();
		providerLabel.addClass('ia-table-subtext');
		providerLabel.setText(providerMeta.label);
		const separator = metaRow.createSpan();
		separator.addClass('ia-model-meta-separator');
		separator.setText('•');
		const idSpan = metaRow.createSpan();
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
			badge.setCssProps({ 'background': capabilityColors[cap] || 'var(--background-modifier-border)' });
		});

		const statusCell = row.insertCell();
		statusCell.addClass('ia-table-cell');
		const statusStack = statusCell.createDiv('ia-table-stack');
		const statusBadge = statusStack.createDiv('ia-status-badge');
		statusBadge.addClass(model.enabled ? 'is-success' : 'is-danger');
		statusBadge.setText(model.enabled ? 'Enabled' : 'Disabled');

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

		const toggleBtn = actionsCell.createEl('button', { text: model.enabled ? 'Disable' : 'Enable' });
		toggleBtn.addClass('ia-button');
		toggleBtn.addClass(model.enabled ? 'ia-button--ghost' : 'ia-button--primary');
		toggleBtn.addEventListener('click', async () => {
			model.enabled = !model.enabled;
			await plugin.saveSettings();
			refreshDisplay();
		});

		if ((model.capabilities ?? []).includes('chat')) {
			const chatBtn = actionsCell.createEl('button', { text: isDefaultChat ? 'Default Chat' : 'Set Default Chat' });
			chatBtn.addClass('ia-button');
			chatBtn.addClass(isDefaultChat ? 'ia-button--success' : 'ia-button--ghost');
			if (isDefaultChat) {
				chatBtn.disabled = true;
			} else {
				chatBtn.addEventListener('click', async () => {
					plugin.settings.defaultModel = model.id;
					await plugin.saveSettings();
					new Notice(`Default chat model set to ${model.name}`);
					refreshDisplay();
				});
			}
		}

		if ((model.capabilities ?? []).includes('embedding') && plugin.settings.ragConfig) {
			const embeddingBtn = actionsCell.createEl('button', { text: isDefaultEmbedding ? 'Default Embedding' : 'Set Default Embedding' });
			embeddingBtn.addClass('ia-button');
			embeddingBtn.addClass(isDefaultEmbedding ? 'ia-button--success' : 'ia-button--ghost');
			if (isDefaultEmbedding) {
				embeddingBtn.disabled = true;
			} else {
				embeddingBtn.addEventListener('click', async () => {
					plugin.settings.ragConfig.embeddingModel = model.id;
					await plugin.saveSettings();
					new Notice(`Default embedding model set to ${model.name}`);
					refreshDisplay();
				});
			}
		}
	});
}

function renderModelFilters(
	parent: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	capabilities: ModelCapability[],
	filters: ModelFilters,
	onFilterChange: (filters: Partial<ModelFilters>) => void,
	refreshDisplay: () => void
): void {
	const filterBar = parent.createDiv('ia-filter-bar');

	const providerSelect = filterBar.createEl('select');
	providerSelect.addClass('ia-filter-control');
	providerSelect.addClass('ia-filter-control--compact');
	providerSelect.createEl('option', { value: 'all', text: 'All Providers' });

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

	const capabilitySelect = filterBar.createEl('select');
	capabilitySelect.addClass('ia-filter-control');
	capabilitySelect.addClass('ia-filter-control--compact');
	capabilitySelect.createEl('option', { value: 'all', text: 'All Capabilities' });

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

	const statusSelect = filterBar.createEl('select');
	statusSelect.addClass('ia-filter-control');
	statusSelect.addClass('ia-filter-control--compact');
	statusSelect.createEl('option', { value: 'all', text: 'All States' });
	statusSelect.createEl('option', { value: 'enabled', text: 'Enabled' });
	statusSelect.createEl('option', { value: 'disabled', text: 'Disabled' });
	statusSelect.value = filters.enabledFilter;
	statusSelect.addEventListener('change', (event: Event) => {
		onFilterChange({ enabledFilter: (event.target as HTMLSelectElement).value as 'all' | 'enabled' | 'disabled' });
		refreshDisplay();
	});

	const searchInput = filterBar.createEl('input', { type: 'search', placeholder: 'Search name or ID' });
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
