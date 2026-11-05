/**
 * RAG Settings Tab
 * Displays Retrieval-Augmented Generation configuration and Web Search
 */

import { Setting } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import { t } from '@/i18n';
import type { RAGConfig } from '@/features/knowledge';
import { SettingsForm } from '@/ui/settings/settings-form';
import { renderIndexManagement } from './rag-index-panel';
import { TestIds } from '@/ui/utils/test-ids';
import { displayWebSearchTab } from './websearch-tab';
import { renderSubTabs } from '@/ui/settings/sub-tabs';

const EMBEDDING_MODEL_PLACEHOLDER = 'text-embedding-3-small';
const GRADER_MODEL_PLACEHOLDER = 'gpt-4o-mini';
const FILE_TYPES_PLACEHOLDER = 'md, txt';

export function displayRAGTab(
	containerEl: HTMLElement,
	plugin: PluginHost
): void {

	const desc = containerEl.createEl('p', {
		text: t('settings.rag.desc')
	});
	desc.addClass('ia-section-description');

	renderSubTabs(containerEl, {
		tabs: [
			{ id: 'overview', label: t('settings.rag.subTabs.overview') },
			{ id: 'chunking', label: t('settings.rag.subTabs.chunking') },
			{ id: 'search', label: t('settings.rag.subTabs.search') },
			{ id: 'filters', label: t('settings.rag.subTabs.filters') },
			{ id: 'advanced', label: t('settings.rag.subTabs.advanced') },
			{ id: 'websearch', label: t('settings.rag.subTabs.websearch') },
		],
		active: 'overview',
		render: (content, id) => {
			switch (id) {
				case 'overview':
					renderOverviewTab(content, plugin);
					break;
				case 'chunking':
					renderChunkingSettings(content, plugin);
					break;
				case 'search':
					renderSearchSettings(content, plugin);
					break;
				case 'filters':
					renderFileFilters(content, plugin);
					break;
				case 'advanced':
					renderAdvancedTab(content, plugin);
					break;
				case 'websearch':
					displayWebSearchTab(content, plugin);
					break;
			}
		},
	});
}

function renderOverviewTab(containerEl: HTMLElement, plugin: PluginHost): void {
	// General Settings Section
	renderGeneralSettings(containerEl, plugin);

	// Index Management Section
	renderIndexManagement(containerEl, plugin);
}

function renderAdvancedTab(containerEl: HTMLElement, plugin: PluginHost): void {
	// Advanced Settings Section
	renderAdvancedSettings(containerEl, plugin);

	// Grading Settings Section
	renderGradingSettings(containerEl, plugin);
}

function renderGeneralSettings(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.general.title')).setHeading();
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
	}, { placeholder: EMBEDDING_MODEL_PLACEHOLDER });
	form.toggle('embedChangedFiles', {
		label: t('settings.rag.general.embedChanged.name'),
		description: t('settings.rag.general.embedChanged.desc'),
	});
}

function renderChunkingSettings(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.chunking.title')).setHeading();
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
}

function renderSearchSettings(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.search.title')).setHeading();
	const form = ragForm(section, plugin);

	const method = new Setting(section)
		.setName(t('settings.rag.search.searchType.name'))
		.setDesc(t('ux.similarityOnly'));
	method.controlEl.createSpan({ text: t('settings.rag.search.searchType.similarity'), cls: 'ia-readonly-value' });
	form.number('topK', {
		label: t('settings.rag.search.topK.name'),
		description: t('settings.rag.search.topK.desc'),
	}, { placeholder: '5', integer: true, min: 1, max: 20 });
	form.number('similarityThreshold', {
		label: t('settings.rag.search.threshold.name'),
		description: t('settings.rag.search.threshold.desc'),
	}, { placeholder: '0.7', min: 0, max: 1 });
	form.number('contextWindowLimit', {
		label: t('settings.rag.search.contextLimit.name'),
		description: t('settings.rag.search.contextLimit.desc'),
	}, { placeholder: '4000', integer: true, min: 1 });
}

function renderFileFilters(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.filters.title')).setHeading();
	const form = ragForm(section, plugin);

	form.list('excludeFolders', {
		label: t('settings.rag.filters.excludeFolders.name'),
		description: t('settings.rag.filters.excludeFolders.desc'),
	}, `${plugin.app.vault.configDir}, .trash`);
	form.list('includeFileTypes', {
		label: t('settings.rag.filters.includeTypes.name'),
		description: t('settings.rag.filters.includeTypes.desc'),
	}, FILE_TYPES_PLACEHOLDER);
	form.list('excludeFileTypes', {
		label: t('settings.rag.filters.excludeTypes.name'),
		description: t('settings.rag.filters.excludeTypes.desc'),
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

function renderAdvancedSettings(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.advanced.title')).setHeading();

	ragForm(section, plugin).number('embeddingBatchSize', {
		label: t('settings.rag.advanced.batchSize.name'),
		description: t('settings.rag.advanced.batchSize.desc'),
	}, { placeholder: '10', integer: true, min: 1 });
}

function renderGradingSettings(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.grading.title')).setHeading();
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
				}, { placeholder: GRADER_MODEL_PLACEHOLDER });
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

function ragForm(container: HTMLElement, plugin: PluginHost): SettingsForm<RAGConfig> {
	return new SettingsForm(container, () => plugin.settings.ragConfig, (change) => plugin.updateSettings(change), 'ragConfig');
}
