/**
 * E2E Tests for RAG Settings - Search Subtab
 * Tests search type and retrieval parameters
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import {

	openRagTab,
	switchRagSubtab,
	getSearchType,
	selectSearchType,
	getTopK,
	setTopK,
	getSimilarityThreshold,
	setSimilarityThreshold,
	getRelevanceScoreWeight,
	setRelevanceScoreWeight,
} from '../../utils/rag-helpers';

describe('RAG Settings - Search', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openRagTab();
		await switchRagSubtab('search');
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('Search Type Selection', () => {
		it('should allow selecting similarity search', async () => {
			await selectSearchType('similarity');
			await browser.pause(500);

			const searchType = await getSearchType();
			expect(searchType.toLowerCase()).toContain('similarity');
		});

		it('should allow selecting MMR (Maximum Marginal Relevance)', async () => {
			await selectSearchType('mmr');
			await browser.pause(500);

			const searchType = await getSearchType();
			expect(searchType.toLowerCase()).toContain('mmr');
		});

		it('should allow selecting hybrid search', async () => {
			await selectSearchType('hybrid');
			await browser.pause(500);

			const searchType = await getSearchType();
			expect(searchType.toLowerCase()).toContain('hybrid');
		});

		it('should persist search type selection', async () => {
			await selectSearchType('similarity');
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('search');

			// Verify persisted
			const searchType = await getSearchType();
			expect(searchType.toLowerCase()).toContain('similarity');
		});
	});

	describe('Top K Configuration', () => {
		it('should allow setting top K value', async () => {
			const testTopK = 10;
			await setTopK(testTopK);
			await browser.pause(500);

			const topK = await getTopK();
			expect(topK).toBe(testTopK);
		});

		it('should validate top K range (1-100)', async () => {
			// Set to minimum
			await setTopK(1);
			await browser.pause(500);

			const minTopK = await getTopK();
			expect(minTopK).toBe(1);

			// Set to middle value
			await setTopK(50);
			await browser.pause(500);

			const topK = await getTopK();
			expect(topK).toBe(50);
			expect(topK).toBeGreaterThanOrEqual(1);
			expect(topK).toBeLessThanOrEqual(100);
		});

		it('should persist top K value', async () => {
			const testTopK = 15;
			await setTopK(testTopK);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('search');

			// Verify persisted
			const topK = await getTopK();
			expect(topK).toBe(testTopK);
		});
	});

	describe('Similarity Threshold Configuration', () => {
		it('should allow setting similarity threshold (0-1)', async () => {
			const testThreshold = 0.7;
			await setSimilarityThreshold(testThreshold);
			await browser.pause(500);

			const threshold = await getSimilarityThreshold();
			expect(threshold).toBeCloseTo(testThreshold, 1);
		});

		it('should validate threshold range', async () => {
			// Set to 0 (minimum)
			await setSimilarityThreshold(0);
			await browser.pause(500);

			const minThreshold = await getSimilarityThreshold();
			expect(minThreshold).toBe(0);

			// Set to 1 (maximum)
			await setSimilarityThreshold(1);
			await browser.pause(500);

			const maxThreshold = await getSimilarityThreshold();
			expect(maxThreshold).toBe(1);

			// Set to middle value
			await setSimilarityThreshold(0.5);
			await browser.pause(500);

			const threshold = await getSimilarityThreshold();
			expect(threshold).toBeGreaterThanOrEqual(0);
			expect(threshold).toBeLessThanOrEqual(1);
		});

		it('should persist threshold value', async () => {
			const testThreshold = 0.8;
			await setSimilarityThreshold(testThreshold);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('search');

			// Verify persisted
			const threshold = await getSimilarityThreshold();
			expect(threshold).toBeCloseTo(testThreshold, 1);
		});
	});

	describe('Relevance Score Weight', () => {
		it('should allow setting relevance score weight', async () => {
			const testWeight = 0.6;
			await setRelevanceScoreWeight(testWeight);
			await browser.pause(500);

			const weight = await getRelevanceScoreWeight();
			expect(weight).toBeCloseTo(testWeight, 1);
		});

		it('should validate weight range', async () => {
			// Set weight to reasonable value
			await setRelevanceScoreWeight(0.5);
			await browser.pause(500);

			const weight = await getRelevanceScoreWeight();
			expect(weight).toBeGreaterThanOrEqual(0);
			expect(weight).toBeLessThanOrEqual(1);
		});

		it('should persist weight value', async () => {
			const testWeight = 0.7;
			await setRelevanceScoreWeight(testWeight);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('search');

			// Verify persisted
			const weight = await getRelevanceScoreWeight();
			expect(weight).toBeCloseTo(testWeight, 1);
		});
	});

	describe('Search Configuration Persistence', () => {
		it('should persist all search settings', async () => {
			// Configure all search settings
			await selectSearchType('similarity');
			await setTopK(20);
			await setSimilarityThreshold(0.75);
			await setRelevanceScoreWeight(0.6);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('search');

			// Verify all settings persisted
			const searchType = await getSearchType();
			expect(searchType.toLowerCase()).toContain('similarity');
			expect(await getTopK()).toBe(20);
			expect(await getSimilarityThreshold()).toBeCloseTo(0.75, 1);
			expect(await getRelevanceScoreWeight()).toBeCloseTo(0.6, 1);
		});
	});
});
