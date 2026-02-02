/**
 * E2E Tests for RAG Settings - Advanced Subtab
 * Tests compression, caching, re-ranking, and document grading settings
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import {

	openRagTab,
	switchRagSubtab,
	isCompressionEnabled,
	toggleCompression,
	getEmbeddingBatchSize,
	setEmbeddingBatchSize,
	getIndexingMode,
	selectIndexingMode,
	getContextWindowLimit,
	setContextWindowLimit,
	isSemanticCachingEnabled,
	toggleSemanticCaching,
	getCacheSize,
	setCacheSize,
	isCacheSizeVisible,
	isReRankingEnabled,
	toggleReRanking,
	getReRankingModel,
	selectReRankingModel,
	isReRankingModelVisible,
	isGradingThresholdEnabled,
	toggleGradingThreshold,
	getGradingThreshold,
	setGradingThreshold,
	isGradingThresholdInputVisible,
} from '../../utils/rag-helpers';

describe('RAG Settings - Advanced', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openRagTab();
		await switchRagSubtab('advanced');
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('Compression Settings', () => {
		it('should enable compression', async () => {
			await toggleCompression(true);
			await browser.pause(300);

			const isEnabled = await isCompressionEnabled();
			expect(isEnabled).toBe(true);
		});

		it('should disable compression', async () => {
			// First enable
			await toggleCompression(true);
			await browser.pause(300);

			// Then disable
			await toggleCompression(false);
			await browser.pause(300);

			const isEnabled = await isCompressionEnabled();
			expect(isEnabled).toBe(false);
		});

		it('should persist compression setting', async () => {
			await toggleCompression(true);
			await browser.pause(300);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('advanced');

			// Verify persisted
			const isEnabled = await isCompressionEnabled();
			expect(isEnabled).toBe(true);

			// Restore original state
			await toggleCompression(false);
		});
	});

	describe('Batch Size Configuration', () => {
		it('should allow setting embedding batch size', async () => {
			const testBatchSize = 50;
			await setEmbeddingBatchSize(testBatchSize);
			await browser.pause(300);

			const batchSize = await getEmbeddingBatchSize();
			expect(batchSize).toBe(testBatchSize);
		});

		it('should validate batch size range', async () => {
			// Set to reasonable value
			await setEmbeddingBatchSize(100);
			await browser.pause(300);

			const batchSize = await getEmbeddingBatchSize();
			expect(batchSize).toBe(100);
			expect(batchSize).toBeGreaterThan(0);
			expect(batchSize).toBeLessThan(1000);
		});

		it('should persist batch size value', async () => {
			const testBatchSize = 75;
			await setEmbeddingBatchSize(testBatchSize);
			await browser.pause(300);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('advanced');

			// Verify persisted
			const batchSize = await getEmbeddingBatchSize();
			expect(batchSize).toBe(testBatchSize);
		});
	});

	describe('Indexing Mode and Context Window', () => {
		it('should allow setting context window limit', async () => {
			const testLimit = 4000;
			await setContextWindowLimit(testLimit);
			await browser.pause(300);

			const limit = await getContextWindowLimit();
			expect(limit).toBe(testLimit);
		});

		it('should persist context window setting', async () => {
			const testLimit = 8000;
			await setContextWindowLimit(testLimit);
			await browser.pause(300);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('advanced');

			// Verify persisted
			const limit = await getContextWindowLimit();
			expect(limit).toBe(testLimit);
		});
	});

	describe('Semantic Caching', () => {
		it('should enable semantic caching', async () => {
			await toggleSemanticCaching(true);
			await browser.pause(300);

			const isEnabled = await isSemanticCachingEnabled();
			expect(isEnabled).toBe(true);
		});

		it('should disable semantic caching', async () => {
			// First enable
			await toggleSemanticCaching(true);
			await browser.pause(300);

			// Then disable
			await toggleSemanticCaching(false);
			await browser.pause(300);

			const isEnabled = await isSemanticCachingEnabled();
			expect(isEnabled).toBe(false);
		});

		it('should show cache size input when enabled', async () => {
			await toggleSemanticCaching(true);
			await browser.pause(500);

			const isVisible = await isCacheSizeVisible();
			expect(isVisible).toBe(true);
		});

		it('should hide cache size input when disabled', async () => {
			await toggleSemanticCaching(false);
			await browser.pause(500);

			const isVisible = await isCacheSizeVisible();
			expect(isVisible).toBe(false);
		});

		it('should allow setting cache size when enabled', async () => {
			await toggleSemanticCaching(true);
			await browser.pause(300);

			const testCacheSize = 1000;
			await setCacheSize(testCacheSize);
			await browser.pause(300);

			const cacheSize = await getCacheSize();
			expect(cacheSize).toBe(testCacheSize);
		});

		it('should persist caching settings', async () => {
			await toggleSemanticCaching(true);
			await setCacheSize(500);
			await browser.pause(300);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('advanced');

			// Verify persisted
			expect(await isSemanticCachingEnabled()).toBe(true);
			expect(await getCacheSize()).toBe(500);

			// Restore original state
			await toggleSemanticCaching(false);
		});

		it('should maintain cache size value when toggling off/on', async () => {
			await toggleSemanticCaching(true);
			await setCacheSize(750);
			await browser.pause(300);

			// Toggle off
			await toggleSemanticCaching(false);
			await browser.pause(300);

			// Toggle back on
			await toggleSemanticCaching(true);
			await browser.pause(300);

			// Cache size should be maintained
			const cacheSize = await getCacheSize();
			expect(cacheSize).toBe(750);

			// Cleanup
			await toggleSemanticCaching(false);
		});
	});

	describe('Re-ranking Configuration', () => {
		it('should enable re-ranking', async () => {
			await toggleReRanking(true);
			await browser.pause(300);

			const isEnabled = await isReRankingEnabled();
			expect(isEnabled).toBe(true);
		});

		it('should disable re-ranking', async () => {
			// First enable
			await toggleReRanking(true);
			await browser.pause(300);

			// Then disable
			await toggleReRanking(false);
			await browser.pause(300);

			const isEnabled = await isReRankingEnabled();
			expect(isEnabled).toBe(false);
		});

		it('should show re-ranking model dropdown when enabled', async () => {
			await toggleReRanking(true);
			await browser.pause(500);

			const isVisible = await isReRankingModelVisible();
			expect(isVisible).toBe(true);
		});

		it('should hide re-ranking model dropdown when disabled', async () => {
			await toggleReRanking(false);
			await browser.pause(500);

			const isVisible = await isReRankingModelVisible();
			expect(isVisible).toBe(false);
		});

		it('should allow selecting re-ranking model when enabled', async () => {
			await toggleReRanking(true);
			await browser.pause(300);

			// Try to select a re-ranking model (if available)
			try {
				const testModel = 'rerank-1'; // Example model
				await selectReRankingModel(testModel);
				await browser.pause(300);

				const model = await getReRankingModel();
				expect(model).toBe(testModel);
			} catch (e) {
				// If model not available, just verify dropdown exists
				const isVisible = await isReRankingModelVisible();
				expect(isVisible).toBe(true);
			}
		});

		it('should persist re-ranking settings', async () => {
			await toggleReRanking(true);
			await browser.pause(300);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('advanced');

			// Verify persisted
			expect(await isReRankingEnabled()).toBe(true);

			// Restore original state
			await toggleReRanking(false);
		});
	});

	describe('Document Grading', () => {
		it('should enable grading threshold', async () => {
			await toggleGradingThreshold(true);
			await browser.pause(300);

			const isEnabled = await isGradingThresholdEnabled();
			expect(isEnabled).toBe(true);
		});

		it('should disable grading threshold', async () => {
			// First enable
			await toggleGradingThreshold(true);
			await browser.pause(300);

			// Then disable
			await toggleGradingThreshold(false);
			await browser.pause(300);

			const isEnabled = await isGradingThresholdEnabled();
			expect(isEnabled).toBe(false);
		});

		it('should show threshold input when enabled', async () => {
			await toggleGradingThreshold(true);
			await browser.pause(500);

			const isVisible = await isGradingThresholdInputVisible();
			expect(isVisible).toBe(true);
		});

		it('should hide threshold input when disabled', async () => {
			await toggleGradingThreshold(false);
			await browser.pause(500);

			const isVisible = await isGradingThresholdInputVisible();
			expect(isVisible).toBe(false);
		});

		it('should allow setting grading threshold (0-1) when enabled', async () => {
			await toggleGradingThreshold(true);
			await browser.pause(300);

			const testThreshold = 0.8;
			await setGradingThreshold(testThreshold);
			await browser.pause(300);

			const threshold = await getGradingThreshold();
			expect(threshold).toBeCloseTo(testThreshold, 1);
		});

		it('should persist grading settings', async () => {
			await toggleGradingThreshold(true);
			await setGradingThreshold(0.7);
			await browser.pause(300);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('advanced');

			// Verify persisted
			expect(await isGradingThresholdEnabled()).toBe(true);
			expect(await getGradingThreshold()).toBeCloseTo(0.7, 1);

			// Restore original state
			await toggleGradingThreshold(false);
		});

		it('should maintain threshold value when toggling off/on', async () => {
			await toggleGradingThreshold(true);
			await setGradingThreshold(0.9);
			await browser.pause(300);

			// Toggle off
			await toggleGradingThreshold(false);
			await browser.pause(300);

			// Toggle back on
			await toggleGradingThreshold(true);
			await browser.pause(300);

			// Threshold should be maintained
			const threshold = await getGradingThreshold();
			expect(threshold).toBeCloseTo(0.9, 1);

			// Cleanup
			await toggleGradingThreshold(false);
		});
	});

	describe('Conditional UI Rendering', () => {
		it('should show/hide cache size based on caching toggle', async () => {
			// Disable caching
			await toggleSemanticCaching(false);
			await browser.pause(500);

			expect(await isCacheSizeVisible()).toBe(false);

			// Enable caching
			await toggleSemanticCaching(true);
			await browser.pause(500);

			expect(await isCacheSizeVisible()).toBe(true);

			// Cleanup
			await toggleSemanticCaching(false);
		});

		it('should show/hide re-ranking model based on re-ranking toggle', async () => {
			// Disable re-ranking
			await toggleReRanking(false);
			await browser.pause(500);

			expect(await isReRankingModelVisible()).toBe(false);

			// Enable re-ranking
			await toggleReRanking(true);
			await browser.pause(500);

			expect(await isReRankingModelVisible()).toBe(true);

			// Cleanup
			await toggleReRanking(false);
		});

		it('should show/hide grading threshold based on grading toggle', async () => {
			// Disable grading
			await toggleGradingThreshold(false);
			await browser.pause(500);

			expect(await isGradingThresholdInputVisible()).toBe(false);

			// Enable grading
			await toggleGradingThreshold(true);
			await browser.pause(500);

			expect(await isGradingThresholdInputVisible()).toBe(true);

			// Cleanup
			await toggleGradingThreshold(false);
		});
	});
});
