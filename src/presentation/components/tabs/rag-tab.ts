/**
 * RAG Settings Tab
 * Displays Retrieval-Augmented Generation configuration
 */

import { Setting, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { RAGManager } from '@/infrastructure/rag-manager';
import { applyConfigFieldMetadata, type ConfigFieldMetadataOptions } from '@/presentation/utils/config-field-metadata';

export function displayRAGTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: 'RAG configuration' });

	const desc = containerEl.createEl('p', {
		text: 'Configure retrieval-augmented generation to enhance AI responses with your vault content.'
	});
	desc.addClass('ia-section-description');

	// Create sub-tab navigation
	const tabNavContainer = containerEl.createDiv('ia-rag-tab-nav');
	tabNavContainer.removeClass('ia-hidden');
	tabNavContainer.setCssProps({ 'gap': '8px' });
	tabNavContainer.setCssProps({ 'margin-bottom': '20px' });
	tabNavContainer.setCssProps({ 'border-bottom': '1px solid var(--background-modifier-border)' });
	tabNavContainer.setCssProps({ 'padding-bottom': '8px' });

	// Create content container for sub-tabs
	const tabContentContainer = containerEl.createDiv('ia-rag-tab-content');

	const subTabs = [
		{ id: 'overview', label: 'Overview', icon: '🏠' },
		{ id: 'chunking', label: 'Chunking', icon: '📄' },
		{ id: 'search', label: 'Search', icon: '🔍' },
		{ id: 'filters', label: 'Filters', icon: '🗂️' },
		{ id: 'advanced', label: 'Advanced', icon: '⚙️' }
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
		}
	};

	// Create tab buttons
	subTabs.forEach(tab => {
		const tabBtn = tabNavContainer.createEl('button', {
			text: `${tab.icon} ${tab.label}`,
			cls: 'ia-rag-subtab-btn'
		});

		tabBtn.setCssProps({ 'padding': '8px 16px' });
		tabBtn.setCssProps({ 'border': 'none' });
		tabBtn.setCssProps({ 'background': activeTab === tab.id ? 'var(--interactive-accent)' : 'transparent' });
		tabBtn.setCssProps({ 'color': activeTab === tab.id ? 'var(--text-on-accent)' : 'var(--text-normal)' });
		tabBtn.addClass('ia-clickable');
		tabBtn.setCssProps({ 'border-radius': '4px' });
		tabBtn.setCssProps({ 'transition': 'all 0.2s' });

		tabBtn.addEventListener('click', () => {
			activeTab = tab.id;
			// Update all buttons
			tabNavContainer.querySelectorAll('.ia-rag-subtab-btn').forEach((btn, index) => {
				const isActive = subTabs[index].id === activeTab;
				(btn as HTMLElement).setCssProps({
					'background': isActive ? 'var(--interactive-accent)' : 'transparent',
					'color': isActive ? 'var(--text-on-accent)' : 'var(--text-normal)'
				});
			});
			renderActiveTab();
		});

		// Hover effect
		tabBtn.addEventListener('mouseenter', () => {
			if (activeTab !== tab.id) {
				tabBtn.setCssProps({ 'background': 'var(--background-modifier-hover)' });
			}
		});
		tabBtn.addEventListener('mouseleave', () => {
			if (activeTab !== tab.id) {
				tabBtn.setCssProps({ 'background': 'transparent' });
			}
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
	section.createEl('h4', { text: 'General settings' });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.enabled',
		label: 'Enable RAG',
		description: 'Enable Retrieval-Augmented Generation for enhanced context'
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.enabled)
			.onChange(async (value) => {
				plugin.settings.ragConfig.enabled = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.vectorStore',
		label: 'Vector store',
		description: 'Vector database for storing embeddings'
	}).addDropdown(dropdown => dropdown
			.addOptions({
				'memory': 'In-Memory',
				'disk': 'Disk-Based'
			})
			.setValue(plugin.settings.ragConfig.vectorStore)
			.onChange(async (value) => {
				plugin.settings.ragConfig.vectorStore = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.embeddingModel',
		label: 'Embedding model',
		description: 'model to use for generating embeddings'
	}).addText(text => text
			.setPlaceholder('Text-embedding-ada-002')
			.setValue(plugin.settings.ragConfig.embeddingModel)
			.onChange(async (value) => {
				plugin.settings.ragConfig.embeddingModel = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.embedChangedFiles',
		label: 'Embed changed files automatically',
		description: 'Automatically re-embed files when they are modified'
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.embedChangedFiles)
			.onChange(async (value) => {
				plugin.settings.ragConfig.embedChangedFiles = value;
				await plugin.saveSettings();
			}));
}

function renderIndexManagement(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: 'Index management' });

	const indexDesc = section.createEl('p', {
		text: 'Manage your RAG index and view statistics about indexed content.'
	});
	indexDesc.addClass('setting-item-description');

	// Create a stats container that will be updated
	const statsContainer = section.createDiv('ia-rag-stats');
	statsContainer.setCssProps({ 'margin-bottom': '16px' });
	statsContainer.setCssProps({ 'padding': '12px' });
	statsContainer.setCssProps({ 'background-color': 'var(--background-secondary)' });
	statsContainer.setCssProps({ 'border-radius': '4px' });

	// Function to update stats display
	const updateStats = async () => {
		statsContainer.empty();

		const ragManager = new RAGManager(
			plugin.app,
			plugin.settings.ragConfig,
			plugin.settings.llmConfigs
		);

		try {
			await ragManager.initialize();
			const stats = await ragManager.getDetailedStats();

			statsContainer.createEl('div', {
				text: `Index statistics`,
				attr: { style: 'font-weight: bold; margin-bottom: 8px;' }
			});

			const statsGrid = statsContainer.createDiv();
			statsGrid.removeClass('ia-hidden');
			statsGrid.setCssProps({ 'grid-template-columns': '1fr 1fr' });
			statsGrid.setCssProps({ 'gap': '8px' });

			const addStat = (label: string, value: string | number | undefined) => {
				const statItem = statsGrid.createDiv();
				statItem.removeClass('ia-hidden');
				statItem.setCssProps({ 'flex-direction': 'column' });
				statItem.createEl('span', {
					text: label,
					attr: { style: 'font-size: 0.9em; color: var(--text-muted);' }
				});
				statItem.createEl('span', {
					text: (value ?? 0).toString(),
					attr: { style: 'font-weight: 600;' }
				});
			};

			// Safely access stats with defaults
			const chunkCount = stats?.chunkCount ?? 0;
			const fileCount = stats?.fileCount ?? 0;
			const totalSize = stats?.totalSize ?? 0;

			addStat('Total Chunks', chunkCount);
			addStat('Unique Files', fileCount);
			addStat('Total Characters', totalSize.toLocaleString());

			// Calculate average chunk size
			const avgChunkSize = chunkCount > 0 ? Math.round(totalSize / chunkCount) : 0;
			addStat('Avg Chunk Size', avgChunkSize);

			// Show empty index message if no data
			if (chunkCount === 0) {
				statsContainer.createEl('div', {
					text: 'Index is empty. Select rebuild index to start indexing.',
					attr: { style: 'margin-top: 8px; font-size: 0.9em; color: var(--text-muted); font-style: italic;' }
				});
			}
		} catch (error) {
			statsContainer.createEl('div', {
				text: '⚠️ unable to load index statistics',
				attr: { style: 'color: var(--text-error);' }
			});
			console.error('Failed to load RAG stats:', error);
		}
	};

	// Initial stats load
	void updateStats();

	// Rebuild Index button
	new Setting(section)
		.setName('Rebuild index')
		.setDesc('Re-index all files in your vault. This may take a while.')
		.addButton(button => button
			.setButtonText('Rebuild')
			.setWarning()
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText('Rebuilding...');

				try {
					const ragManager = new RAGManager(
						plugin.app,
						plugin.settings.ragConfig,
						plugin.settings.llmConfigs
					);
					await ragManager.initialize();
					await ragManager.clearIndex();
					await ragManager.indexVault();
					await updateStats();
					new Notice('Index rebuilt successfully');
				} catch (error) {
					console.error('Failed to rebuild index:', error);
					new Notice('Failed to rebuild index');
				} finally {
					button.setDisabled(false);
					button.setButtonText('Rebuild');
				}
			}));

	// Refresh Index button
	new Setting(section)
		.setName('Refresh index')
		.setDesc('Update the index with any changed files since last indexing.')
		.addButton(button => button
			.setButtonText('Refresh')
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText('Refreshing...');

				try {
					const ragManager = new RAGManager(
						plugin.app,
						plugin.settings.ragConfig,
						plugin.settings.llmConfigs
					);
					await ragManager.initialize();
					await ragManager.refreshIndex();
					await updateStats();
					new Notice('Index refreshed successfully');
				} catch (error) {
					console.error('Failed to refresh index:', error);
					new Notice('Failed to refresh index');
				} finally {
					button.setDisabled(false);
					button.setButtonText('Refresh');
				}
			}));

	// Clear Index button
	new Setting(section)
		.setName('Clear index')
		.setDesc('Remove all indexed data. You will need to rebuild the index.')
		.addButton(button => button
			.setButtonText('Clear')
			.setWarning()
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText('Clearing...');

				try {
					const ragManager = new RAGManager(
						plugin.app,
						plugin.settings.ragConfig,
						plugin.settings.llmConfigs
					);
					await ragManager.initialize();
					await ragManager.clearIndex();
					await updateStats();
					new Notice('Index cleared successfully');
				} catch (error) {
					console.error('Failed to clear index:', error);
					new Notice('Failed to clear index');
				} finally {
					button.setDisabled(false);
					button.setButtonText('Clear');
				}
			}));
}

function renderChunkingSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: 'Chunking settings' });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.chunkingStrategy',
		label: 'Chunking strategy',
		description: 'Strategy for splitting documents into chunks'
	}).addDropdown(dropdown => dropdown
			.addOptions({
				'recursive': 'Recursive (Smart)',
				'fixed': 'Fixed Size',
				'sentence': 'By Sentence',
				'paragraph': 'By Paragraph'
			})
			.setValue(plugin.settings.ragConfig.chunkingStrategy)
			.onChange(async (value) => {
				plugin.settings.ragConfig.chunkingStrategy = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.chunkSize',
		label: 'Chunk size',
		description: 'Number of characters per chunk (500-2000 recommended)'
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
		label: 'Chunk overlap',
		description: 'Number of overlapping characters between chunks'
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
		label: 'Min chunk size',
		description: 'Minimum chunk size to create'
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
		label: 'Max tokens per chunk',
		description: 'Maximum tokens allowed per chunk'
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
	section.createEl('h4', { text: 'Search settings' });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.searchType',
		label: 'Search type',
		description: 'Type of similarity search to perform'
	}).addDropdown(dropdown => dropdown
			.addOptions({
				'similarity': 'Similarity',
				'mmr': 'MMR (Diverse Results)',
				'hybrid': 'Hybrid'
			})
			.setValue(plugin.settings.ragConfig.searchType)
			.onChange(async (value) => {
				plugin.settings.ragConfig.searchType = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.topK',
		label: 'Top K results',
		description: 'Number of most relevant chunks to retrieve (1-20)'
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
		label: 'Similarity threshold',
		description: 'Minimum similarity score to include results (0.0-1.0)'
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
		label: 'Relevance score weight',
		description: 'Weight for relevance scoring (0.0-1.0)'
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
		label: 'Context window limit',
		description: 'Maximum tokens for retrieved context'
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
	section.createEl('h4', { text: 'File filters' });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.excludeFolders',
		label: 'Exclude folders',
		description: 'folders to exclude from indexing (comma-separated)',
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
		label: 'Include file types',
		description: 'File types to include (empty = all types)',
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
		label: 'Exclude file types',
		description: 'File types to exclude from indexing',
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
		label: 'Filter by tag',
		description: 'Only index files with these tags (empty = all files)'
	}).addTextArea(text => text
			.setPlaceholder('Important, reference')
			.setValue(plugin.settings.ragConfig.filterByTag.join(', '))
			.onChange(async (value) => {
				plugin.settings.ragConfig.filterByTag = value.split(',').map(s => s.trim()).filter(s => s);
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.excludeByTag',
		label: 'Exclude by tag',
		description: 'Exclude files with these tags from indexing'
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
	section.createEl('h4', { text: 'Advanced settings' });

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.enableCompression',
		label: 'Enable compression',
		description: 'Compress embeddings to reduce storage size'
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.enableCompression)
			.onChange(async (value) => {
				plugin.settings.ragConfig.enableCompression = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.embeddingBatchSize',
		label: 'Embedding batch size',
		description: 'Number of chunks to embed in parallel'
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

	createSetting({
		path: 'ragConfig.enableSemanticCaching',
		label: 'Enable semantic caching',
		description: 'Cache search results for faster retrieval'
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.enableSemanticCaching)
			.onChange(async (value) => {
				plugin.settings.ragConfig.enableSemanticCaching = value;
				await plugin.saveSettings();
			}));

	createSetting({
		path: 'ragConfig.cacheSize',
		label: 'Cache size',
		description: 'Number of cached search results to maintain'
	}).addText(text => text
			.setPlaceholder('100')
			.setValue(plugin.settings.ragConfig.cacheSize.toString())
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num > 0) {
					plugin.settings.ragConfig.cacheSize = num;
					await plugin.saveSettings();
				}
			}));

	createSetting({
		path: 'ragConfig.reRankingEnabled',
		label: 'Enable re-ranking',
		description: 'Re-rank search results using a secondary model'
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.reRankingEnabled)
			.onChange(async (value) => {
				plugin.settings.ragConfig.reRankingEnabled = value;
				await plugin.saveSettings();
			}));

	if (plugin.settings.ragConfig.reRankingEnabled) {
		createSetting({
			path: 'ragConfig.reRankingModel',
			label: 'Re-Ranking Model',
			description: 'Model to use for re-ranking results'
		}).addText(text => text
				.setPlaceholder('Cross-encoder/ms-marco-MiniLM-L-6-v2')
				.setValue(plugin.settings.ragConfig.reRankingModel)
				.onChange(async (value) => {
					plugin.settings.ragConfig.reRankingModel = value;
					await plugin.saveSettings();
				}));
	}
}

function renderGradingSettings(containerEl: HTMLElement, plugin: IntelligenceAssistantPlugin): void {
	const section = containerEl.createDiv('ia-settings-section');
	section.createEl('h4', { text: 'Grading settings' });

	const graderDesc = section.createEl('p', {
		text: 'Grade retrieved chunks for relevance before sending to the LLM. This helps filter out low-quality results.'
	});
	graderDesc.addClass('setting-item-description');

	const createSetting = (options: ConfigFieldMetadataOptions) =>
		applyConfigFieldMetadata(new Setting(section), options);

	createSetting({
		path: 'ragConfig.enableGradingThreshold',
		label: 'Enable grading threshold',
		description: 'Filter chunks below quality thresholds'
	}).addToggle(toggle => toggle
			.setValue(plugin.settings.ragConfig.enableGradingThreshold)
			.onChange(async (value) => {
				plugin.settings.ragConfig.enableGradingThreshold = value;
				await plugin.saveSettings();
			}));

	if (plugin.settings.ragConfig.enableGradingThreshold) {
		createSetting({
			path: 'ragConfig.graderModelSource',
			label: 'Grader model source',
			description: 'Where to get the grader model from'
		}).addDropdown(dropdown => dropdown
				.addOptions({
					'chat': 'Chat Model',
					'custom': 'Custom Model'
				})
				.setValue(plugin.settings.ragConfig.graderModelSource)
				.onChange(async (value) => {
					plugin.settings.ragConfig.graderModelSource = value;
					await plugin.saveSettings();
				}));

		if (plugin.settings.ragConfig.graderModelSource === 'custom' && plugin.settings.ragConfig.graderModel) {
			createSetting({
				path: 'ragConfig.graderModel',
				label: 'Grader model',
				description: 'specific model to use for grading'
			}).addText(text => text
					.setPlaceholder('Gpt-4')
					.setValue(plugin.settings.ragConfig.graderModel || '')
					.onChange(async (value) => {
						plugin.settings.ragConfig.graderModel = value;
						await plugin.saveSettings();
					}));
		}

		createSetting({
			path: 'ragConfig.graderParallelProcessing',
			label: 'Parallel processing',
			description: 'Number of chunks to grade in parallel'
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
				label: 'Min relevance score',
				description: 'Minimum relevance score (0.0-1.0)'
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
				label: 'Min accuracy score',
				description: 'Minimum accuracy score (0.0-1.0)'
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
				label: 'Min support quality score',
				description: 'Minimum support quality score (0.0-1.0)'
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
}
