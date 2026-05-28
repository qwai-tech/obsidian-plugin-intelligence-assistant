/**
 * RAG Settings Tab
 * Displays Retrieval-Augmented Generation configuration and Web Search
 */

import { Setting, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n';
import { applyConfigFieldMetadata, type ConfigFieldMetadataOptions } from '@/presentation/utils/config-field-metadata';
import { TestIds } from '@/presentation/utils/test-ids';
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

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.enabled',
		label: t('settings.rag.general.enableRag.name'),
		description: t('settings.rag.general.enableRag.desc')
	}).addToggle(toggle => {
		toggle.toggleEl.setAttribute('data-testid', TestIds.settings.ragEnableToggle);
		toggle.setValue(plugin.settings.ragConfig.enabled)
			.onChange(async (value) => {
				plugin.settings.ragConfig.enabled = value;
				plugin.getRAGManager().updateConfig(plugin.settings.ragConfig, plugin.settings.llmConfigs);
				await plugin.saveSettings();
			});
	});

	createSetting({
		path: 'ragConfig.vectorStore',
		label: t('settings.rag.general.vectorStore.name'),
		description: t('settings.rag.general.vectorStore.desc')
	}).addDropdown(dropdown => dropdown
			.addOptions({
				'memory': t('settings.rag.general.vectorStore.memory'),
				'disk': t('settings.rag.general.vectorStore.disk')
			})
			.setValue(plugin.settings.ragConfig.vectorStore)
			.onChange(async (value) => {
				plugin.settings.ragConfig.vectorStore = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.embeddingModel',
		label: t('settings.rag.general.embeddingModel.name'),
		description: t('settings.rag.general.embeddingModel.desc')
	}).addText(text => text
			.setPlaceholder('Text-embedding-ada-002')
			.setValue(plugin.settings.ragConfig.embeddingModel)
			.onChange(async (value) => {
				plugin.settings.ragConfig.embeddingModel = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.embedChangedFiles',
		label: t('settings.rag.general.embedChanged.name'),
		description: t('settings.rag.general.embedChanged.desc')
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.embedChangedFiles)
			.onChange(async (value) => {
				plugin.settings.ragConfig.embedChangedFiles = value;
				await plugin.saveSettings();
			}));
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

		const ragManager = plugin.getRAGManager();

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
			button.setButtonText(t('settings.rag.indexMgmt.rebuild.btn'))
			.setWarning()
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.rebuild.rebuilding'));

				try {
					const ragManager = plugin.getRAGManager();
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
					const ragManager = plugin.getRAGManager();
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
		.addButton(button => button
			.setButtonText(t('settings.rag.indexMgmt.clear.btn'))
			.setWarning()
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.clear.clearing'));

				try {
					const ragManager = plugin.getRAGManager();
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

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.chunkingStrategy',
		label: t('settings.rag.chunking.strategy.name'),
		description: t('settings.rag.chunking.strategy.desc')
	}).addDropdown(dropdown => dropdown
			.addOptions({
				'recursive': t('settings.rag.chunking.strategy.recursive'),
				'fixed': t('settings.rag.chunking.strategy.fixed'),
				'sentence': t('settings.rag.chunking.strategy.sentence'),
				'paragraph': t('settings.rag.chunking.strategy.paragraph')
			})
			.setValue(plugin.settings.ragConfig.chunkingStrategy)
			.onChange(async (value) => {
				plugin.settings.ragConfig.chunkingStrategy = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.chunkSize',
		label: t('settings.rag.chunking.chunkSize.name'),
		description: t('settings.rag.chunking.chunkSize.desc')
	}).addText(text => text
			.setPlaceholder('1000')
			.setValue(plugin.settings.ragConfig.chunkSize.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					plugin.settings.ragConfig.chunkSize = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.chunkOverlap',
		label: t('settings.rag.chunking.chunkOverlap.name'),
		description: t('settings.rag.chunking.chunkOverlap.desc')
	}).addText(text => text
			.setPlaceholder('200')
			.setValue(plugin.settings.ragConfig.chunkOverlap.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num >= 0) {
					plugin.settings.ragConfig.chunkOverlap = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.minChunkSize',
		label: t('settings.rag.chunking.minChunkSize.name'),
		description: t('settings.rag.chunking.minChunkSize.desc')
	}).addText(text => text
			.setPlaceholder('100')
			.setValue(plugin.settings.ragConfig.minChunkSize.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					plugin.settings.ragConfig.minChunkSize = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.maxTokensPerChunk',
		label: t('settings.rag.chunking.maxTokens.name'),
		description: t('settings.rag.chunking.maxTokens.desc')
	}).addText(text => text
			.setPlaceholder('512')
			.setValue(plugin.settings.ragConfig.maxTokensPerChunk.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					plugin.settings.ragConfig.maxTokensPerChunk = num;
					await plugin.saveSettings();
				}
			}));
}

function renderSearchSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.search.title') });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.searchType',
		label: t('settings.rag.search.searchType.name'),
		description: t('settings.rag.search.searchType.desc')
	}).addDropdown(dropdown => dropdown
			.addOptions({
				'similarity': t('settings.rag.search.searchType.similarity'),
			})
			.setValue(plugin.settings.ragConfig.searchType)
			.onChange(async (value) => {
				plugin.settings.ragConfig.searchType = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.topK',
		label: t('settings.rag.search.topK.name'),
		description: t('settings.rag.search.topK.desc')
	}).addText(text => text
			.setPlaceholder('5')
			.setValue(plugin.settings.ragConfig.topK.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0 && num <= 20) {
					plugin.settings.ragConfig.topK = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.similarityThreshold',
		label: t('settings.rag.search.threshold.name'),
		description: t('settings.rag.search.threshold.desc')
	}).addText(text => text
			.setPlaceholder('0.7')
			.setValue(plugin.settings.ragConfig.similarityThreshold.toString())
			.onChange(async (value) => {
				const num = parseFloat(value);
				if (!isNaN(num) && num >= 0 && num <= 1) {
					plugin.settings.ragConfig.similarityThreshold = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.relevanceScoreWeight',
		label: t('settings.rag.search.weight.name'),
		description: t('settings.rag.search.weight.desc')
	}).addText(text => text
			.setPlaceholder('0.5')
			.setValue(plugin.settings.ragConfig.relevanceScoreWeight.toString())
			.onChange(async (value) => {
				const num = parseFloat(value);
				if (!isNaN(num) && num >= 0 && num <= 1) {
					plugin.settings.ragConfig.relevanceScoreWeight = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.contextWindowLimit',
		label: t('settings.rag.search.contextLimit.name'),
		description: t('settings.rag.search.contextLimit.desc')
	}).addText(text => text
			.setPlaceholder('4000')
			.setValue(plugin.settings.ragConfig.contextWindowLimit.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					plugin.settings.ragConfig.contextWindowLimit = num;
					await plugin.saveSettings();
				}
			}));
}

function renderFileFilters(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.filters.title') });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.excludeFolders',
		label: t('settings.rag.filters.excludeFolders.name'),
		description: t('settings.rag.filters.excludeFolders.desc'),
		includeDefaultForArrays: true
	}).addTextArea(text => text
			.setPlaceholder(`${plugin.app.vault.configDir}, .trash`)
			.setValue(plugin.settings.ragConfig.excludeFolders.join(', '))
			.onChange(async (value) => {
				plugin.settings.ragConfig.excludeFolders = value.split(',').map(s => s.trim()).filter(s => s);
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.includeFileTypes',
		label: t('settings.rag.filters.includeTypes.name'),
		description: t('settings.rag.filters.includeTypes.desc'),
		includeDefaultForArrays: true
	}).addTextArea(text => text
			.setPlaceholder('Md, txt')
			.setValue(plugin.settings.ragConfig.includeFileTypes.join(', '))
			.onChange(async (value) => {
				plugin.settings.ragConfig.includeFileTypes = value.split(',').map(s => s.trim()).filter(s => s);
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.excludeFileTypes',
		label: t('settings.rag.filters.excludeTypes.name'),
		description: t('settings.rag.filters.excludeTypes.desc'),
		includeDefaultForArrays: true
	}).addTextArea(text => text
			.setPlaceholder('canvas, excalidraw')
			.setValue(plugin.settings.ragConfig.excludeFileTypes.join(', '))
			.onChange(async (value) => {
				plugin.settings.ragConfig.excludeFileTypes = value.split(',').map(s => s.trim()).filter(s => s);
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.filterByTag',
		label: t('settings.rag.filters.filterByTag.name'),
		description: t('settings.rag.filters.filterByTag.desc')
	}).addTextArea(text => text
			.setPlaceholder('Important, reference')
			.setValue(plugin.settings.ragConfig.filterByTag.join(', '))
			.onChange(async (value) => {
				plugin.settings.ragConfig.filterByTag = value.split(',').map(s => s.trim()).filter(s => s);
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.excludeByTag',
		label: t('settings.rag.filters.excludeByTag.name'),
		description: t('settings.rag.filters.excludeByTag.desc')
	}).addTextArea(text => text
			.setPlaceholder('Draft, private')
			.setValue(plugin.settings.ragConfig.excludeByTag.join(', '))
			.onChange(async (value) => {
				plugin.settings.ragConfig.excludeByTag = value.split(',').map(s => s.trim()).filter(s => s);
				await plugin.saveSettings();
			}));
}

function renderAdvancedSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.advanced.title') });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);


	createSetting({
		path: 'ragConfig.embeddingBatchSize',
		label: t('settings.rag.advanced.batchSize.name'),
		description: t('settings.rag.advanced.batchSize.desc')
	}).addText(text => text
			.setPlaceholder('10')
			.setValue(plugin.settings.ragConfig.embeddingBatchSize.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					plugin.settings.ragConfig.embeddingBatchSize = num;
					await plugin.saveSettings();
				}
			}));



	// Re-ranking toggle with dynamic re-rendering
}

function renderGradingSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: t('settings.rag.grading.title') });

	const graderDesc = section.createEl('p', {
		text: t('settings.rag.grading.desc')
	});
	graderDesc.addClass('setting-item-description');

	// Grading toggle with dynamic re-rendering
	const gradingContainer = section.createDiv('ia-grading-container');

	const renderGradingOptions = () => {
		gradingContainer.empty();

		const createSetting = (options: ConfigFieldMetadataOptions) =>
			applyConfigFieldMetadata(new Setting(gradingContainer), options);

		createSetting({
			path: 'ragConfig.enableGradingThreshold',
			label: t('settings.rag.grading.enableGrading.name'),
			description: t('settings.rag.grading.enableGrading.desc')
		}).addToggle(toggle => toggle
				.setValue(plugin.settings.ragConfig.enableGradingThreshold)
				.onChange(async (value) => {
					plugin.settings.ragConfig.enableGradingThreshold = value;
					await plugin.saveSettings();
					renderGradingOptions();
				}));

		if (plugin.settings.ragConfig.enableGradingThreshold) {
			// Model source container for nested dynamic rendering
			const modelSourceContainer = gradingContainer.createDiv('ia-grading-model-source-container');

			const renderModelSourceOptions = () => {
				modelSourceContainer.empty();

				const createModelSourceSetting = (options: ConfigFieldMetadataOptions) =>
					applyConfigFieldMetadata(new Setting(modelSourceContainer), options);

				createModelSourceSetting({
					path: 'ragConfig.graderModelSource',
					label: t('settings.rag.grading.graderSource.name'),
					description: t('settings.rag.grading.graderSource.desc')
				}).addDropdown(dropdown => dropdown
						.addOptions({
							'chat': t('settings.rag.grading.graderSource.chat'),
							'custom': t('settings.rag.grading.graderSource.custom')
						})
						.setValue(plugin.settings.ragConfig.graderModelSource)
						.onChange(async (value) => {
							plugin.settings.ragConfig.graderModelSource = value;
							await plugin.saveSettings();
							renderModelSourceOptions();
						}));

				if (plugin.settings.ragConfig.graderModelSource === 'custom') {
					createModelSourceSetting({
						path: 'ragConfig.graderModel',
						label: t('settings.rag.grading.graderModel.name'),
						description: t('settings.rag.grading.graderModel.desc')
					}).addText(text => text
							.setPlaceholder('Gpt-4')
							.setValue(plugin.settings.ragConfig.graderModel || '')
							.onChange(async (value) => {
								plugin.settings.ragConfig.graderModel = value;
								await plugin.saveSettings();
							}));
				}
			};

			renderModelSourceOptions();

			createSetting({
				path: 'ragConfig.graderParallelProcessing',
				label: t('settings.rag.grading.parallel.name'),
				description: t('settings.rag.grading.parallel.desc')
			}).addText(text => text
					.setPlaceholder('3')
					.setValue(plugin.settings.ragConfig.graderParallelProcessing?.toString() || '3')
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							plugin.settings.ragConfig.graderParallelProcessing = num;
							await plugin.saveSettings();
						}
					}));

			if (plugin.settings.ragConfig.minRelevanceScore !== undefined) {
				createSetting({
					path: 'ragConfig.minRelevanceScore',
					label: t('settings.rag.grading.minRelevance.name'),
					description: t('settings.rag.grading.minRelevance.desc')
				}).addText(text => text
						.setPlaceholder('0.5')
						.setValue(plugin.settings.ragConfig.minRelevanceScore?.toString() || '0.5')
						.onChange(async (value) => {
							const num = parseFloat(value);
							if (!isNaN(num) && num >= 0 && num <= 1) {
								plugin.settings.ragConfig.minRelevanceScore = num;
								await plugin.saveSettings();
							}
						}));
			}

			if (plugin.settings.ragConfig.minAccuracyScore !== undefined) {
				createSetting({
					path: 'ragConfig.minAccuracyScore',
					label: t('settings.rag.grading.minAccuracy.name'),
					description: t('settings.rag.grading.minAccuracy.desc')
				}).addText(text => text
						.setPlaceholder('0.5')
						.setValue(plugin.settings.ragConfig.minAccuracyScore?.toString() || '0.5')
						.onChange(async (value) => {
							const num = parseFloat(value);
							if (!isNaN(num) && num >= 0 && num <= 1) {
								plugin.settings.ragConfig.minAccuracyScore = num;
								await plugin.saveSettings();
							}
						}));
			}

			if (plugin.settings.ragConfig.minSupportQualityScore !== undefined) {
				createSetting({
					path: 'ragConfig.minSupportQualityScore',
					label: t('settings.rag.grading.minSupport.name'),
					description: t('settings.rag.grading.minSupport.desc')
				}).addText(text => text
						.setPlaceholder('0.5')
						.setValue(plugin.settings.ragConfig.minSupportQualityScore?.toString() || '0.5')
						.onChange(async (value) => {
							const num = parseFloat(value);
							if (!isNaN(num) && num >= 0 && num <= 1) {
								plugin.settings.ragConfig.minSupportQualityScore = num;
								await plugin.saveSettings();
							}
						}));
			}
		}
	};

	renderGradingOptions();
}
