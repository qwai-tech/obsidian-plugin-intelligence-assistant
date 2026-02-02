/**
 * Helper functions for RAG settings E2E tests
 */

import { SELECTORS } from './selectors';
import { navigateToTab } from './actions';

// === Navigation ===

/**
 * Open the RAG tab in settings
 */
export async function openRagTab() {
	await navigateToTab(SELECTORS.rag.tab);
	const tabContent = await $(SELECTORS.rag.tabContent);
	await tabContent.waitForDisplayed({ timeout: 5000 });
}

/**
 * Switch to a specific RAG subtab
 */
export async function switchRagSubtab(
	subtab: 'overview' | 'chunking' | 'search' | 'filters' | 'advanced' | 'websearch'
) {
	const subtabSelector = {
		overview: SELECTORS.rag.overviewSubtab,
		chunking: SELECTORS.rag.chunkingSubtab,
		search: SELECTORS.rag.searchSubtab,
		filters: SELECTORS.rag.filtersSubtab,
		advanced: SELECTORS.rag.advancedSubtab,
		websearch: SELECTORS.rag.websearchSubtab,
	}[subtab];

	const subtabButton = await $(subtabSelector);
	await subtabButton.click();
	await browser.pause(500);
}

/**
 * Get the current active RAG subtab
 */
export async function getCurrentRagSubtab(): Promise<string> {
	const activeSubtab = await $(SELECTORS.rag.activeSubtab);
	const text = await activeSubtab.getText();
	return text.toLowerCase();
}

// === Overview Subtab Helpers ===

/**
 * Check if RAG is enabled
 */
export async function isRagEnabled(): Promise<boolean> {
	const toggle = await $(SELECTORS.rag.overview.enabledToggle);
	const checkbox = await toggle.$('input[type="checkbox"]');
	return await checkbox.isSelected();
}

/**
 * Toggle RAG enabled/disabled
 */
export async function toggleRagEnabled(enabled: boolean) {
	const isCurrentlyEnabled = await isRagEnabled();

	if (isCurrentlyEnabled !== enabled) {
		const toggle = await $(SELECTORS.rag.overview.enabledToggle);
		await toggle.click();
		await browser.pause(500);
	}
}

/**
 * Get the selected embedding model
 */
export async function getEmbeddingModel(): Promise<string> {
	const dropdown = await $(SELECTORS.rag.overview.embeddingModelDropdown);
	return await dropdown.getValue();
}

/**
 * Select an embedding model
 */
export async function selectEmbeddingModel(model: string) {
	const dropdown = await $(SELECTORS.rag.overview.embeddingModelDropdown);
	await dropdown.selectByVisibleText(model);
	await browser.pause(300);
}

/**
 * Get the selected vector store type
 */
export async function getVectorStore(): Promise<'memory' | 'disk'> {
	const dropdown = await $(SELECTORS.rag.overview.vectorStoreDropdown);
	const value = await dropdown.getValue();
	return value as 'memory' | 'disk';
}

/**
 * Select a vector store type
 */
export async function selectVectorStore(store: 'memory' | 'disk') {
	const dropdown = await $(SELECTORS.rag.overview.vectorStoreDropdown);
	const storeText = store === 'memory' ? 'Memory' : 'Disk';
	await dropdown.selectByVisibleText(storeText);
	await browser.pause(300);
}

/**
 * Check if auto-embed is enabled
 */
export async function isAutoEmbedEnabled(): Promise<boolean> {
	const toggle = await $(SELECTORS.rag.overview.autoEmbedToggle);
	const checkbox = await toggle.$('input[type="checkbox"]');
	return await checkbox.isSelected();
}

/**
 * Toggle auto-embed enabled/disabled
 */
export async function toggleAutoEmbed(enabled: boolean) {
	const isCurrentlyEnabled = await isAutoEmbedEnabled();

	if (isCurrentlyEnabled !== enabled) {
		const toggle = await $(SELECTORS.rag.overview.autoEmbedToggle);
		await toggle.click();
		await browser.pause(500);
	}
}

// === Index Management Helpers ===

/**
 * Get index statistics
 */
export async function getIndexStats(): Promise<{
	docCount: number;
	chunkCount: number;
	size: string;
}> {
	const docCountEl = await $(SELECTORS.rag.overview.docCountText);
	const chunkCountEl = await $(SELECTORS.rag.overview.chunkCountText);
	const indexSizeEl = await $(SELECTORS.rag.overview.indexSizeText);

	const docCountText = await docCountEl.getText();
	const chunkCountText = await chunkCountEl.getText();
	const sizeText = await indexSizeEl.getText();

	return {
		docCount: parseInt(docCountText, 10) || 0,
		chunkCount: parseInt(chunkCountText, 10) || 0,
		size: sizeText,
	};
}

/**
 * Rebuild the RAG index
 */
export async function rebuildIndex(confirm = true) {
	const rebuildButton = await $(SELECTORS.rag.overview.rebuildButton);
	await rebuildButton.click();
	await browser.pause(500);

	if (confirm) {
		// Handle confirmation dialog if present
		await browser.keys('Enter');
		await waitForIndexOperation();
	}
}

/**
 * Refresh the RAG index (embed new/changed files)
 */
export async function refreshIndex() {
	const refreshButton = await $(SELECTORS.rag.overview.refreshButton);
	await refreshButton.click();
	await waitForIndexOperation();
}

/**
 * Clear the RAG index
 */
export async function clearIndex(confirm = true) {
	const clearButton = await $(SELECTORS.rag.overview.clearButton);
	await clearButton.click();
	await browser.pause(500);

	if (confirm) {
		// Handle confirmation dialog if present
		await browser.keys('Enter');
		await waitForIndexOperation();
	}
}

/**
 * Wait for an index operation to complete
 */
export async function waitForIndexOperation(timeout = 10000) {
	// Wait for operation progress indicator to appear and disappear
	const progressIndicator = await $(SELECTORS.rag.overview.operationProgress);

	if (await progressIndicator.isExisting()) {
		await progressIndicator.waitForDisplayed({ timeout, reverse: true });
	}

	await browser.pause(1000); // Additional buffer for stats update
}

// === Chunking Subtab Helpers ===

/**
 * Get the selected chunking strategy
 */
export async function getChunkingStrategy(): Promise<string> {
	const dropdown = await $(SELECTORS.rag.chunking.strategyDropdown);
	return await dropdown.getValue();
}

/**
 * Select a chunking strategy
 */
export async function selectChunkingStrategy(
	strategy: 'recursive' | 'fixed' | 'sentence' | 'paragraph'
) {
	const dropdown = await $(SELECTORS.rag.chunking.strategyDropdown);
	const strategyText = {
		recursive: 'Recursive',
		fixed: 'Fixed size',
		sentence: 'Sentence-based',
		paragraph: 'Paragraph-based',
	}[strategy];

	await dropdown.selectByVisibleText(strategyText);
	await browser.pause(300);
}

/**
 * Get chunk size value
 */
export async function getChunkSize(): Promise<number> {
	const input = await $(SELECTORS.rag.chunking.chunkSizeInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set chunk size value
 */
export async function setChunkSize(size: number) {
	const input = await $(SELECTORS.rag.chunking.chunkSizeInput);
	await input.setValue(size.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Get chunk overlap value
 */
export async function getChunkOverlap(): Promise<number> {
	const input = await $(SELECTORS.rag.chunking.chunkOverlapInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set chunk overlap value
 */
export async function setChunkOverlap(overlap: number) {
	const input = await $(SELECTORS.rag.chunking.chunkOverlapInput);
	await input.setValue(overlap.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Get max tokens per chunk value
 */
export async function getMaxTokensPerChunk(): Promise<number> {
	const input = await $(SELECTORS.rag.chunking.maxTokensInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set max tokens per chunk value
 */
export async function setMaxTokensPerChunk(tokens: number) {
	const input = await $(SELECTORS.rag.chunking.maxTokensInput);
	await input.setValue(tokens.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Get min chunk size value
 */
export async function getMinChunkSize(): Promise<number> {
	const input = await $(SELECTORS.rag.chunking.minChunkSizeInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set min chunk size value
 */
export async function setMinChunkSize(size: number) {
	const input = await $(SELECTORS.rag.chunking.minChunkSizeInput);
	await input.setValue(size.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

// === Search Subtab Helpers ===

/**
 * Get the selected search type
 */
export async function getSearchType(): Promise<string> {
	const dropdown = await $(SELECTORS.rag.search.searchTypeDropdown);
	return await dropdown.getValue();
}

/**
 * Select a search type
 */
export async function selectSearchType(type: 'similarity' | 'mmr' | 'hybrid') {
	const dropdown = await $(SELECTORS.rag.search.searchTypeDropdown);
	const typeText = {
		similarity: 'Similarity',
		mmr: 'MMR (Maximum Marginal Relevance)',
		hybrid: 'Hybrid',
	}[type];

	await dropdown.selectByVisibleText(typeText);
	await browser.pause(300);
}

/**
 * Get top K value
 */
export async function getTopK(): Promise<number> {
	const input = await $(SELECTORS.rag.search.topKInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set top K value
 */
export async function setTopK(k: number) {
	const input = await $(SELECTORS.rag.search.topKInput);
	await input.setValue(k.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Get similarity threshold value
 */
export async function getSimilarityThreshold(): Promise<number> {
	const input = await $(SELECTORS.rag.search.similarityThresholdInput);
	const value = await input.getValue();
	return parseFloat(value);
}

/**
 * Set similarity threshold value
 */
export async function setSimilarityThreshold(threshold: number) {
	const input = await $(SELECTORS.rag.search.similarityThresholdInput);
	await input.setValue(threshold.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Get relevance score weight value
 */
export async function getRelevanceScoreWeight(): Promise<number> {
	const input = await $(SELECTORS.rag.search.relevanceWeightInput);
	const value = await input.getValue();
	return parseFloat(value);
}

/**
 * Set relevance score weight value
 */
export async function setRelevanceScoreWeight(weight: number) {
	const input = await $(SELECTORS.rag.search.relevanceWeightInput);
	await input.setValue(weight.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

// === Filters Subtab Helpers ===

/**
 * Get list of excluded folders
 */
export async function getExcludedFolders(): Promise<string[]> {
	const listEl = await $(SELECTORS.rag.filters.excludeFoldersList);
	if (!(await listEl.isExisting())) {
		return [];
	}

	const items = await listEl.$$('li, .rag-filter-item');
	const folders: string[] = [];

	for (const item of items) {
		const text = await item.getText();
		folders.push(text);
	}

	return folders;
}

/**
 * Add a folder to the exclusion list
 */
export async function addExcludedFolder(folder: string) {
	const input = await $(SELECTORS.rag.filters.excludeFoldersInput);
	await input.setValue(folder);

	const addButton = await $(SELECTORS.rag.filters.addFolderButton);
	await addButton.click();
	await browser.pause(300);
}

/**
 * Remove a folder from the exclusion list
 */
export async function removeExcludedFolder(folder: string) {
	const removeButton = await $(SELECTORS.rag.filters.removeFolderButton(folder));
	await removeButton.click();
	await browser.pause(300);
}

/**
 * Get list of included file types
 */
export async function getIncludedFileTypes(): Promise<string[]> {
	const listEl = await $(SELECTORS.rag.filters.includeFileTypesList);
	if (!(await listEl.isExisting())) {
		return [];
	}

	const items = await listEl.$$('li, .rag-filter-item');
	const types: string[] = [];

	for (const item of items) {
		const text = await item.getText();
		types.push(text);
	}

	return types;
}

/**
 * Add a file type to the inclusion list
 */
export async function addIncludedFileType(type: string) {
	const input = await $(SELECTORS.rag.filters.includeFileTypesInput);
	await input.setValue(type);

	const addButton = await $(SELECTORS.rag.filters.addIncludeTypeButton);
	await addButton.click();
	await browser.pause(300);
}

/**
 * Remove a file type from the inclusion list
 */
export async function removeIncludedFileType(type: string) {
	const removeButton = await $(SELECTORS.rag.filters.removeIncludeTypeButton(type));
	await removeButton.click();
	await browser.pause(300);
}

/**
 * Get list of excluded file types
 */
export async function getExcludedFileTypes(): Promise<string[]> {
	const listEl = await $(SELECTORS.rag.filters.excludeFileTypesList);
	if (!(await listEl.isExisting())) {
		return [];
	}

	const items = await listEl.$$('li, .rag-filter-item');
	const types: string[] = [];

	for (const item of items) {
		const text = await item.getText();
		types.push(text);
	}

	return types;
}

/**
 * Add a file type to the exclusion list
 */
export async function addExcludedFileType(type: string) {
	const input = await $(SELECTORS.rag.filters.excludeFileTypesInput);
	await input.setValue(type);

	const addButton = await $(SELECTORS.rag.filters.addExcludeTypeButton);
	await addButton.click();
	await browser.pause(300);
}

/**
 * Remove a file type from the exclusion list
 */
export async function removeExcludedFileType(type: string) {
	const removeButton = await $(SELECTORS.rag.filters.removeExcludeTypeButton(type));
	await removeButton.click();
	await browser.pause(300);
}

/**
 * Get list of filter tags
 */
export async function getFilterTags(): Promise<string[]> {
	const listEl = await $(SELECTORS.rag.filters.filterTagsList);
	if (!(await listEl.isExisting())) {
		return [];
	}

	const items = await listEl.$$('li, .rag-filter-item');
	const tags: string[] = [];

	for (const item of items) {
		const text = await item.getText();
		tags.push(text);
	}

	return tags;
}

/**
 * Add a tag to the filter list
 */
export async function addFilterTag(tag: string) {
	const input = await $(SELECTORS.rag.filters.filterTagsInput);
	await input.setValue(tag);

	const addButton = await $(SELECTORS.rag.filters.addFilterTagButton);
	await addButton.click();
	await browser.pause(300);
}

/**
 * Remove a tag from the filter list
 */
export async function removeFilterTag(tag: string) {
	const removeButton = await $(SELECTORS.rag.filters.removeFilterTagButton(tag));
	await removeButton.click();
	await browser.pause(300);
}

/**
 * Get list of excluded tags
 */
export async function getExcludedTags(): Promise<string[]> {
	const listEl = await $(SELECTORS.rag.filters.excludeTagsList);
	if (!(await listEl.isExisting())) {
		return [];
	}

	const items = await listEl.$$('li, .rag-filter-item');
	const tags: string[] = [];

	for (const item of items) {
		const text = await item.getText();
		tags.push(text);
	}

	return tags;
}

/**
 * Add a tag to the exclusion list
 */
export async function addExcludedTag(tag: string) {
	const input = await $(SELECTORS.rag.filters.excludeTagsInput);
	await input.setValue(tag);

	const addButton = await $(SELECTORS.rag.filters.addExcludeTagButton);
	await addButton.click();
	await browser.pause(300);
}

/**
 * Remove a tag from the exclusion list
 */
export async function removeExcludedTag(tag: string) {
	const removeButton = await $(SELECTORS.rag.filters.removeExcludeTagButton(tag));
	await removeButton.click();
	await browser.pause(300);
}

/**
 * Clear all filters
 */
export async function clearAllFilters() {
	const clearButton = await $(SELECTORS.rag.filters.clearAllButton);
	await clearButton.click();
	await browser.pause(500);
}

// === Advanced Subtab Helpers ===

/**
 * Check if compression is enabled
 */
export async function isCompressionEnabled(): Promise<boolean> {
	const toggle = await $(SELECTORS.rag.advanced.compressionToggle);
	const checkbox = await toggle.$('input[type="checkbox"]');
	return await checkbox.isSelected();
}

/**
 * Toggle compression enabled/disabled
 */
export async function toggleCompression(enabled: boolean) {
	const isCurrentlyEnabled = await isCompressionEnabled();

	if (isCurrentlyEnabled !== enabled) {
		const toggle = await $(SELECTORS.rag.advanced.compressionToggle);
		await toggle.click();
		await browser.pause(300);
	}
}

/**
 * Get embedding batch size value
 */
export async function getEmbeddingBatchSize(): Promise<number> {
	const input = await $(SELECTORS.rag.advanced.batchSizeInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set embedding batch size value
 */
export async function setEmbeddingBatchSize(size: number) {
	const input = await $(SELECTORS.rag.advanced.batchSizeInput);
	await input.setValue(size.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Get the selected indexing mode
 */
export async function getIndexingMode(): Promise<string> {
	const dropdown = await $(SELECTORS.rag.advanced.indexingModeDropdown);
	return await dropdown.getValue();
}

/**
 * Select an indexing mode
 */
export async function selectIndexingMode(mode: string) {
	const dropdown = await $(SELECTORS.rag.advanced.indexingModeDropdown);
	await dropdown.selectByVisibleText(mode);
	await browser.pause(300);
}

/**
 * Get context window limit value
 */
export async function getContextWindowLimit(): Promise<number> {
	const input = await $(SELECTORS.rag.advanced.contextWindowInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set context window limit value
 */
export async function setContextWindowLimit(limit: number) {
	const input = await $(SELECTORS.rag.advanced.contextWindowInput);
	await input.setValue(limit.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Check if semantic caching is enabled
 */
export async function isSemanticCachingEnabled(): Promise<boolean> {
	const toggle = await $(SELECTORS.rag.advanced.semanticCachingToggle);
	const checkbox = await toggle.$('input[type="checkbox"]');
	return await checkbox.isSelected();
}

/**
 * Toggle semantic caching enabled/disabled
 */
export async function toggleSemanticCaching(enabled: boolean) {
	const isCurrentlyEnabled = await isSemanticCachingEnabled();

	if (isCurrentlyEnabled !== enabled) {
		const toggle = await $(SELECTORS.rag.advanced.semanticCachingToggle);
		await toggle.click();
		await browser.pause(300);
	}
}

/**
 * Get cache size value
 */
export async function getCacheSize(): Promise<number> {
	const input = await $(SELECTORS.rag.advanced.cacheSizeInput);
	const value = await input.getValue();
	return parseInt(value, 10);
}

/**
 * Set cache size value
 */
export async function setCacheSize(size: number) {
	const input = await $(SELECTORS.rag.advanced.cacheSizeInput);
	await input.setValue(size.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Check if cache size input is visible (depends on caching toggle)
 */
export async function isCacheSizeVisible(): Promise<boolean> {
	const input = await $(SELECTORS.rag.advanced.cacheSizeInput);
	return await input.isDisplayed();
}

/**
 * Check if re-ranking is enabled
 */
export async function isReRankingEnabled(): Promise<boolean> {
	const toggle = await $(SELECTORS.rag.advanced.reRankingToggle);
	const checkbox = await toggle.$('input[type="checkbox"]');
	return await checkbox.isSelected();
}

/**
 * Toggle re-ranking enabled/disabled
 */
export async function toggleReRanking(enabled: boolean) {
	const isCurrentlyEnabled = await isReRankingEnabled();

	if (isCurrentlyEnabled !== enabled) {
		const toggle = await $(SELECTORS.rag.advanced.reRankingToggle);
		await toggle.click();
		await browser.pause(300);
	}
}

/**
 * Get the selected re-ranking model
 */
export async function getReRankingModel(): Promise<string> {
	const dropdown = await $(SELECTORS.rag.advanced.reRankingModelDropdown);
	return await dropdown.getValue();
}

/**
 * Select a re-ranking model
 */
export async function selectReRankingModel(model: string) {
	const dropdown = await $(SELECTORS.rag.advanced.reRankingModelDropdown);
	await dropdown.selectByVisibleText(model);
	await browser.pause(300);
}

/**
 * Check if re-ranking model dropdown is visible (depends on re-ranking toggle)
 */
export async function isReRankingModelVisible(): Promise<boolean> {
	const dropdown = await $(SELECTORS.rag.advanced.reRankingModelDropdown);
	return await dropdown.isDisplayed();
}

/**
 * Check if grading threshold is enabled
 */
export async function isGradingThresholdEnabled(): Promise<boolean> {
	const toggle = await $(SELECTORS.rag.advanced.gradingToggle);
	const checkbox = await toggle.$('input[type="checkbox"]');
	return await checkbox.isSelected();
}

/**
 * Toggle grading threshold enabled/disabled
 */
export async function toggleGradingThreshold(enabled: boolean) {
	const isCurrentlyEnabled = await isGradingThresholdEnabled();

	if (isCurrentlyEnabled !== enabled) {
		const toggle = await $(SELECTORS.rag.advanced.gradingToggle);
		await toggle.click();
		await browser.pause(300);
	}
}

/**
 * Get grading threshold value
 */
export async function getGradingThreshold(): Promise<number> {
	const input = await $(SELECTORS.rag.advanced.gradingThresholdInput);
	const value = await input.getValue();
	return parseFloat(value);
}

/**
 * Set grading threshold value
 */
export async function setGradingThreshold(threshold: number) {
	const input = await $(SELECTORS.rag.advanced.gradingThresholdInput);
	await input.setValue(threshold.toString());
	await input.click(); // Blur to trigger validation
	await browser.pause(300);
}

/**
 * Check if grading threshold input is visible (depends on grading toggle)
 */
export async function isGradingThresholdInputVisible(): Promise<boolean> {
	const input = await $(SELECTORS.rag.advanced.gradingThresholdInput);
	return await input.isDisplayed();
}

// === Validation Helpers ===

/**
 * Get validation error for a specific field
 */
export async function getValidationError(fieldName: string): Promise<string | null> {
	const errorEl = await $(`.validation-error[data-field="${fieldName}"]`);

	if (await errorEl.isExisting()) {
		return await errorEl.getText();
	}

	return null;
}

/**
 * Check if there are any validation errors
 */
export async function hasValidationError(): Promise<boolean> {
	const errorEl = await $(SELECTORS.rag.validationError);
	return await errorEl.isExisting();
}

/**
 * Check if a specific field is valid
 */
export async function isFieldValid(fieldName: string): Promise<boolean> {
	const error = await getValidationError(fieldName);
	return error === null;
}
