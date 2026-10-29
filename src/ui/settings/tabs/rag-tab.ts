/**
 * RAG Settings Tab
 * Displays Retrieval-Augmented Generation configuration and Web Search
 */

import { Setting, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n/index';
import type { RAGConfig } from '@/features/knowledge/types/rag';
import { SettingsForm } from '@/ui/settings/settings-form';
import { TestIds } from '@/ui/utils/test-ids';
import { setDestructiveButton } from '@/ui/utils/ui-helpers';
import { displayWebSearchTab } from './websearch-tab';

export function displayRAGTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: t('settings.rag.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.rag.desc')
	});
	desc.addClass('ia-section-description');

	// Create sub-tab navigation
	const tabNavContainer = containerEl.createDiv('ia-rag-tab-nav');
	tabNavContainer.removeClass('ia-hidden');

	// Create content container for sub-tabs
	const tabContentContainer = containerEl.createDiv('ia-rag-tab-content');

	const subTabs = [
		{ id: 'overview', label: t('settings.rag.subTabs.overview'), icon: '🏠' },
		{ id: 'chunking', label: t('settings.rag.subTabs.chunking'), icon: '📄' },
		{ id: 'search', label: t('settings.rag.subTabs.search'), icon: '🔍' },
		{ id: 'filters', label: t('settings.rag.subTabs.filters'), icon: '🗂️' },
		{ id: 'advanced', label: t('settings.rag.subTabs.advanced'), icon: '⚙️' },
		{ id: 'websearch', label: t('settings.rag.subTabs.websearch'), icon: '🌐' }
	];

	let activeTab = 'overview';

	const renderActiveTab = () => {
		tabContentContainer.empty();

		switch (activeTab) {
			case 'overview':
				renderOverviewTab(tabContentContainer, plugin);
				break;
			case 'chunking':
				renderChunkingSettings(tabContentContainer, plugin);
				break;
			case 'search':
				renderSearchSettings(tabContentContainer, plugin);
				break;
			case 'filters':
				renderFileFilters(tabContentContainer, plugin);
				break;
			case 'advanced':
				renderAdvancedTab(tabContentContainer, plugin);
				break;
			case 'websearch':
				displayWebSearchTab(tabContentContainer, plugin);
				break;
		}
	};

	// Create tab buttons
	subTabs.forEach(tab => {
		const tabBtn = tabNavContainer.createEl('button', {
			text: `${tab.icon} ${tab.label}`,
			cls: 'ia-rag-subtab-btn'
		});

		tabBtn.toggleClass('ia-rag-subtab-btn--active', activeTab === tab.id);
		tabBtn.addClass('ia-clickable');

		tabBtn.addEventListener('click', () => {
			activeTab = tab.id;
			// Update all buttons
			tabNavContainer.querySelectorAll('.ia-rag-subtab-btn').forEach((btn, index) => {
				const isActive = subTabs[index].id === activeTab;
				(btn as HTMLElement).toggleClass('ia-rag-subtab-btn--active', isActive);
			});
			renderActiveTab();
		});
	});

	// Initial render
	renderActiveTab();
}

function renderOverviewTab(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	// General Settings Section
	renderGeneralSettings(containerEl, plugin);

	// Index Management Section
	renderIndexManagement(containerEl, plugin);
}

function renderAdvancedTab(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	// Advanced Settings Section
	renderAdvancedSettings(containerEl, plugin);

	// Grading Settings Section
	renderGradingSettings(containerEl, plugin);
}

function renderGeneralSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.general.title') });
	const form = ragForm(section, plugin);

	form.toggle('enabled', {
		label: t('settings.rag.general.enableRag.name'),
		description: t('settings.rag.general.enableRag.desc'),
		testId: TestIds.settings.ragEnableToggle,
	});
	form.dropdown('vectorStore', {
		label: t('settings.rag.general.vectorStore.name'),
		description: t('settings.rag.general.vectorStore.desc'),
	}, {
		memory: t('settings.rag.general.vectorStore.memory'),
		disk: t('settings.rag.general.vectorStore.disk'),
	});
	form.text('embeddingModel', {
		label: t('settings.rag.general.embeddingModel.name'),
		description: t('settings.rag.general.embeddingModel.desc'),
	}, { placeholder: 'Text-embedding-ada-002' });
	form.toggle('embedChangedFiles', {
		label: t('settings.rag.general.embedChanged.name'),
		description: t('settings.rag.general.embedChanged.desc'),
	});
}

function renderIndexManagement(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.indexMgmt.title') });

	const indexDesc = section.createEl('p', {
		text: t('settings.rag.indexMgmt.desc')
	});
	indexDesc.addClass('setting-item-description');

	// Create a stats container that will be updated
	const statsContainer = section.createDiv('ia-rag-stats');
	statsContainer.setAttribute('data-testid', TestIds.settings.ragStats);

	// Function to update stats display
	const updateStats = async () => {
		statsContainer.empty();

		const ragManager = plugin.services.rag;

		try {
			const stats = await ragManager.getDetailedStats();

			statsContainer.createEl('div', {
				text: t('settings.rag.indexMgmt.statsTitle'),
				cls: 'ia-rag-stats-title'
			});

			const statsGrid = statsContainer.createDiv('ia-rag-stats-grid');

			const addStat = (label: string, value: string | number | undefined) => {
				const statItem = statsGrid.createDiv('ia-stat-item');
				statItem.createEl('span', {
					text: label,
					cls: 'ia-stat-label'
				});
				statItem.createEl('span', {
					text: (value ?? 0).toString(),
					cls: 'ia-stat-value'
				});
			};

			// Safely access stats with defaults
			const chunkCount = stats?.chunkCount ?? 0;
			const fileCount = stats?.fileCount ?? 0;
			const totalSize = stats?.totalSize ?? 0;

			addStat(t('settings.rag.indexMgmt.stats.totalChunks'), chunkCount);
			addStat(t('settings.rag.indexMgmt.stats.uniqueFiles'), fileCount);
			addStat(t('settings.rag.indexMgmt.stats.totalChars'), totalSize.toLocaleString());

			// Calculate average chunk size
			const avgChunkSize = chunkCount > 0 ? Math.round(totalSize / chunkCount) : 0;
			addStat(t('settings.rag.indexMgmt.stats.avgChunkSize'), avgChunkSize);

			// Show empty index message if no data
			if (chunkCount === 0) {
				statsContainer.createEl('div', {
					text: t('settings.rag.indexMgmt.empty'),
					cls: 'ia-rag-empty-notice'
				});
			}
		} catch (error) {
			statsContainer.createEl('div', {
				text: t('settings.rag.indexMgmt.error'),
				cls: 'ia-rag-stats-error'
			});
			console.error('Failed to load RAG stats:', error);
		}
	};

	// Initial stats load
	void updateStats();

	// Rebuild Index button
	new Setting(section)
		.setName(t('settings.rag.indexMgmt.rebuild.name'))
		.setDesc(t('settings.rag.indexMgmt.rebuild.desc'))
		.addButton(button => {
			button.buttonEl.setAttribute('data-testid', TestIds.settings.ragRebuildBtn);
			setDestructiveButton(button.setButtonText(t('settings.rag.indexMgmt.rebuild.btn')))
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.rebuild.rebuilding'));

				try {
					const ragManager = plugin.services.rag;
					ragManager.updateConfig(plugin.settings.ragConfig, plugin.settings.llmConfigs);
					await ragManager.clearIndex();
					await ragManager.indexVault();
					await updateStats();
					new Notice(t('settings.rag.indexMgmt.notices.rebuilt'));
				} catch (error) {
					console.error('Failed to rebuild index:', error);
					new Notice(t('settings.rag.indexMgmt.notices.rebuildFailed'));
				} finally {
					button.setDisabled(false);
					button.setButtonText(t('settings.rag.indexMgmt.rebuild.btn'));
				}
			});
		});

	// Refresh Index button
	new Setting(section)
		.setName(t('settings.rag.indexMgmt.refresh.name'))
		.setDesc(t('settings.rag.indexMgmt.refresh.desc'))
		.addButton(button => button
			.setButtonText(t('settings.rag.indexMgmt.refresh.btn'))
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.refresh.refreshing'));

				try {
					const ragManager = plugin.services.rag;
					await ragManager.refreshIndex();
					await updateStats();
					new Notice(t('settings.rag.indexMgmt.notices.refreshed'));
				} catch (error) {
					console.error('Failed to refresh index:', error);
					new Notice(t('settings.rag.indexMgmt.notices.refreshFailed'));
				} finally {
					button.setDisabled(false);
					button.setButtonText(t('settings.rag.indexMgmt.refresh.btn'));
				}
			}));

	// Clear Index button
	new Setting(section)
		.setName(t('settings.rag.indexMgmt.clear.name'))
		.setDesc(t('settings.rag.indexMgmt.clear.desc'))
		.addButton(button => setDestructiveButton(button
			.setButtonText(t('settings.rag.indexMgmt.clear.btn')))
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.clear.clearing'));

				try {
					const ragManager = plugin.services.rag;
					await ragManager.clearIndex();
					await updateStats();
					new Notice(t('settings.rag.indexMgmt.notices.cleared'));
				} catch (error) {
					console.error('Failed to clear index:', error);
					new Notice(t('settings.rag.indexMgmt.notices.clearFailed'));
				} finally {
					button.setDisabled(false);
					button.setButtonText(t('settings.rag.indexMgmt.clear.btn'));
				}
			}));
}

function renderChunkingSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.chunking.title') });
	const form = ragForm(section, plugin);

	form.dropdown('chunkingStrategy', {
		label: t('settings.rag.chunking.strategy.name'),
		description: t('settings.rag.chunking.strategy.desc'),
	}, {
		recursive: t('settings.rag.chunking.strategy.recursive'),
		fixed: t('settings.rag.chunking.strategy.fixed'),
		sentence: t('settings.rag.chunking.strategy.sentence'),
		paragraph: t('settings.rag.chunking.strategy.paragraph'),
	});
	form.number('chunkSize', {
		label: t('settings.rag.chunking.chunkSize.name'),
		description: t('settings.rag.chunking.chunkSize.desc'),
	}, { placeholder: '1000', integer: true, min: 1 });
	form.number('chunkOverlap', {
		label: t('settings.rag.chunking.chunkOverlap.name'),
		description: t('settings.rag.chunking.chunkOverlap.desc'),
	}, { placeholder: '200', integer: true, min: 0 });
	form.number('minChunkSize', {
		label: t('settings.rag.chunking.minChunkSize.name'),
		description: t('settings.rag.chunking.minChunkSize.desc'),
	}, { placeholder: '100', integer: true, min: 1 });
	form.number('maxTokensPerChunk', {
		label: t('settings.rag.chunking.maxTokens.name'),
		description: t('settings.rag.chunking.maxTokens.desc'),
	}, { placeholder: '512', integer: true, min: 1 });
}

function renderSearchSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.search.title') });
	const form = ragForm(section, plugin);

	form.dropdown('searchType', {
		label: t('settings.rag.search.searchType.name'),
		description: t('settings.rag.search.searchType.desc'),
	}, { similarity: t('settings.rag.search.searchType.similarity') });
	form.number('topK', {
		label: t('settings.rag.search.topK.name'),
		description: t('settings.rag.search.topK.desc'),
	}, { placeholder: '5', integer: true, min: 1, max: 20 });
	form.number('similarityThreshold', {
		label: t('settings.rag.search.threshold.name'),
		description: t('settings.rag.search.threshold.desc'),
	}, { placeholder: '0.7', min: 0, max: 1 });
	form.number('relevanceScoreWeight', {
		label: t('settings.rag.search.weight.name'),
		description: t('settings.rag.search.weight.desc'),
	}, { placeholder: '0.5', min: 0, max: 1 });
	form.number('contextWindowLimit', {
		label: t('settings.rag.search.contextLimit.name'),
		description: t('settings.rag.search.contextLimit.desc'),
	}, { placeholder: '4000', integer: true, min: 1 });
}

function renderFileFilters(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.filters.title') });
	const form = ragForm(section, plugin);

	form.list('excludeFolders', {
		label: t('settings.rag.filters.excludeFolders.name'),
		description: t('settings.rag.filters.excludeFolders.desc'),
		includeDefaultForArrays: true,
	}, `${plugin.app.vault.configDir}, .trash`);
	form.list('includeFileTypes', {
		label: t('settings.rag.filters.includeTypes.name'),
		description: t('settings.rag.filters.includeTypes.desc'),
		includeDefaultForArrays: true,
	}, 'Md, txt');
	form.list('excludeFileTypes', {
		label: t('settings.rag.filters.excludeTypes.name'),
		description: t('settings.rag.filters.excludeTypes.desc'),
		includeDefaultForArrays: true,
	}, 'canvas, excalidraw');
	form.list('filterByTag', {
		label: t('settings.rag.filters.filterByTag.name'),
		description: t('settings.rag.filters.filterByTag.desc'),
	}, 'Important, reference');
	form.list('excludeByTag', {
		label: t('settings.rag.filters.excludeByTag.name'),
		description: t('settings.rag.filters.excludeByTag.desc'),
	}, 'Draft, private');
}

function renderAdvancedSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.advanced.title') });

	ragForm(section, plugin).number('embeddingBatchSize', {
		label: t('settings.rag.advanced.batchSize.name'),
		description: t('settings.rag.advanced.batchSize.desc'),
	}, { placeholder: '10', integer: true, min: 1 });
}

function renderGradingSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.grading.title') });
	section.createEl('p', { text: t('settings.rag.grading.desc'), cls: 'setting-item-description' });
	const gradingContainer = section.createDiv('ia-grading-container');

	const renderGradingOptions = () => {
		gradingContainer.empty();
		const form = ragForm(gradingContainer, plugin);
		const config = plugin.settings.ragConfig;

		form.toggle('enableGradingThreshold', {
			label: t('settings.rag.grading.enableGrading.name'),
			description: t('settings.rag.grading.enableGrading.desc'),
		}, { then: renderGradingOptions });
		if (!config.enableGradingThreshold) {
			return;
		}

		const modelSourceContainer = gradingContainer.createDiv('ia-grading-model-source-container');
		const renderModelSourceOptions = () => {
			modelSourceContainer.empty();
			const sourceForm = ragForm(modelSourceContainer, plugin);
			sourceForm.dropdown('graderModelSource', {
				label: t('settings.rag.grading.graderSource.name'),
				description: t('settings.rag.grading.graderSource.desc'),
			}, {
				chat: t('settings.rag.grading.graderSource.chat'),
				custom: t('settings.rag.grading.graderSource.custom'),
			}, { then: renderModelSourceOptions });
			if (config.graderModelSource === 'custom') {
				sourceForm.text('graderModel', {
					label: t('settings.rag.grading.graderModel.name'),
					description: t('settings.rag.grading.graderModel.desc'),
				}, { placeholder: 'Gpt-4' });
			}
		};
		renderModelSourceOptions();

		form.number('graderParallelProcessing', {
			label: t('settings.rag.grading.parallel.name'),
			description: t('settings.rag.grading.parallel.desc'),
		}, { placeholder: '3', integer: true, min: 1 });

		const scores = [
			{ key: 'minRelevanceScore', name: 'minRelevance', placeholder: '5' },
			{ key: 'minAccuracyScore', name: 'minAccuracy', placeholder: '7' },
			{ key: 'minSupportQualityScore', name: 'minSupport', placeholder: '6' },
		] as const;
		for (const score of scores) {
			if (config[score.key] !== undefined) {
				form.number(score.key, {
					label: t(`settings.rag.grading.${score.name}.name`),
					description: t(`settings.rag.grading.${score.name}.desc`),
				}, { placeholder: score.placeholder, min: 0, max: 10 });
			}
		}
	};

	renderGradingOptions();
}

function ragForm(container: HTMLElement, plugin: IntelligenceAssistantPlugin): SettingsForm<RAGConfig> {
	return new SettingsForm(container, () => plugin.settings.ragConfig, () => plugin.saveSettings(), 'ragConfig');
}
