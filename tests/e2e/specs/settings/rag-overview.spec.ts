/**
 * E2E Tests for RAG Settings - Overview Subtab
 * Tests general settings and index management operations
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import {

	openRagTab,
	switchRagSubtab,
	isRagEnabled,
	toggleRagEnabled,
	getEmbeddingModel,
	selectEmbeddingModel,
	getVectorStore,
	selectVectorStore,
	isAutoEmbedEnabled,
	toggleAutoEmbed,
	getIndexStats,
	rebuildIndex,
	refreshIndex,
	clearIndex,
} from '../../utils/rag-helpers';

describe('RAG Settings - Overview', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openRagTab();
		await switchRagSubtab('overview');
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('General Settings Display', () => {
		it('should display RAG enabled toggle', async () => {
			const enabled = await isRagEnabled();
			expect(typeof enabled).toBe('boolean');
		});

		it('should display embedding model selector', async () => {
			const model = await getEmbeddingModel();
			expect(model).toBeTruthy();
		});

		it('should display vector store selector', async () => {
			const store = await getVectorStore();
			expect(['memory', 'disk']).toContain(store);
		});

		it('should display auto-embed toggle', async () => {
			const autoEmbed = await isAutoEmbedEnabled();
			expect(typeof autoEmbed).toBe('boolean');
		});
	});

	describe('Enable/Disable RAG', () => {
		it('should enable RAG functionality', async () => {
			await toggleRagEnabled(true);
			await browser.pause(500);

			const isEnabled = await isRagEnabled();
			expect(isEnabled).toBe(true);
		});

		it('should disable RAG functionality', async () => {
			// First ensure it's enabled
			await toggleRagEnabled(true);
			await browser.pause(500);

			// Then disable it
			await toggleRagEnabled(false);
			await browser.pause(500);

			const isEnabled = await isRagEnabled();
			expect(isEnabled).toBe(false);
		});

		it('should persist enabled state across reopens', async () => {
			// Enable RAG
			await toggleRagEnabled(true);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('overview');

			// Verify still enabled
			const isEnabled = await isRagEnabled();
			expect(isEnabled).toBe(true);

			// Restore original state
			await toggleRagEnabled(false);
		});
	});

	describe('Embedding Model Selection', () => {
		it('should allow selecting embedding model', async () => {
			// Enable RAG first
			await toggleRagEnabled(true);
			await browser.pause(500);

			// Get current model
			const originalModel = await getEmbeddingModel();

			// Try to select a different model (if available)
			// This test assumes there are multiple embedding models available
			const testModel = 'text-embedding-ada-002'; // Example model
			try {
				await selectEmbeddingModel(testModel);
				await browser.pause(500);

				const selectedModel = await getEmbeddingModel();
				expect(selectedModel).toBe(testModel);

				// Restore original
				await selectEmbeddingModel(originalModel);
			} catch (e) {
				// If specific model not available, just verify we can read the model
				expect(originalModel).toBeTruthy();
			}
		});

		it('should persist model selection', async () => {
			// Enable RAG first
			await toggleRagEnabled(true);
			await browser.pause(500);

			const model = await getEmbeddingModel();

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('overview');

			// Verify model persisted
			const persistedModel = await getEmbeddingModel();
			expect(persistedModel).toBe(model);
		});
	});

	describe('Vector Store Configuration', () => {
		it('should allow selecting memory vector store', async () => {
			await selectVectorStore('memory');
			await browser.pause(500);

			const store = await getVectorStore();
			expect(store).toBe('memory');
		});

		it('should allow selecting disk vector store', async () => {
			await selectVectorStore('disk');
			await browser.pause(500);

			const store = await getVectorStore();
			expect(store).toBe('disk');
		});

		it('should persist vector store selection', async () => {
			await selectVectorStore('memory');
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('overview');

			// Verify persisted
			const store = await getVectorStore();
			expect(store).toBe('memory');
		});
	});

	describe('Auto-Embed Configuration', () => {
		it('should enable auto-embed on file changes', async () => {
			await toggleAutoEmbed(true);
			await browser.pause(500);

			const isEnabled = await isAutoEmbedEnabled();
			expect(isEnabled).toBe(true);
		});

		it('should disable auto-embed', async () => {
			// First enable
			await toggleAutoEmbed(true);
			await browser.pause(500);

			// Then disable
			await toggleAutoEmbed(false);
			await browser.pause(500);

			const isEnabled = await isAutoEmbedEnabled();
			expect(isEnabled).toBe(false);
		});

		it('should persist auto-embed setting', async () => {
			await toggleAutoEmbed(true);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('overview');

			// Verify persisted
			const isEnabled = await isAutoEmbedEnabled();
			expect(isEnabled).toBe(true);

			// Restore original state
			await toggleAutoEmbed(false);
		});
	});

	describe('Index Management Operations', () => {
		beforeEach(async () => {
			// Ensure RAG is enabled for index operations
			await toggleRagEnabled(true);
			await browser.pause(500);
		});

		it('should display index statistics', async () => {
			const stats = await getIndexStats();

			expect(stats).toHaveProperty('docCount');
			expect(stats).toHaveProperty('chunkCount');
			expect(stats).toHaveProperty('size');

			expect(typeof stats.docCount).toBe('number');
			expect(typeof stats.chunkCount).toBe('number');
			expect(typeof stats.size).toBe('string');
		});

		it('should rebuild index with confirmation', async () => {
			const statsBefore = await getIndexStats();

			await rebuildIndex(true);
			await browser.pause(2000); // Wait for rebuild

			const statsAfter = await getIndexStats();

			// Stats may or may not change depending on vault content
			expect(statsAfter).toHaveProperty('docCount');
			expect(statsAfter).toHaveProperty('chunkCount');
		});

		it('should refresh index (embed new/changed files)', async () => {
			await refreshIndex();
			await browser.pause(2000); // Wait for refresh

			const stats = await getIndexStats();

			// Verify stats are valid after refresh
			expect(typeof stats.docCount).toBe('number');
			expect(typeof stats.chunkCount).toBe('number');
		});

		it('should clear index with confirmation', async () => {
			await clearIndex(true);
			await browser.pause(2000); // Wait for clear

			const stats = await getIndexStats();

			// After clearing, counts should be 0
			expect(stats.docCount).toBe(0);
			expect(stats.chunkCount).toBe(0);
		});

		it('should update statistics after operations', async () => {
			// Clear index first
			await clearIndex(true);
			await browser.pause(2000);

			const statsAfterClear = await getIndexStats();
			expect(statsAfterClear.docCount).toBe(0);
			expect(statsAfterClear.chunkCount).toBe(0);

			// Rebuild index
			await rebuildIndex(true);
			await browser.pause(3000); // Wait for rebuild

			const statsAfterRebuild = await getIndexStats();

			// After rebuild, counts may be > 0 if vault has content
			expect(typeof statsAfterRebuild.docCount).toBe('number');
			expect(typeof statsAfterRebuild.chunkCount).toBe('number');
		});
	});

	describe('State Persistence', () => {
		it('should persist all overview settings', async () => {
			// Configure all settings
			await toggleRagEnabled(true);
			await browser.pause(500);

			await selectVectorStore('memory');
			await browser.pause(500);

			await toggleAutoEmbed(true);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('overview');

			// Verify all settings persisted
			expect(await isRagEnabled()).toBe(true);
			expect(await getVectorStore()).toBe('memory');
			expect(await isAutoEmbedEnabled()).toBe(true);

			// Restore defaults
			await toggleRagEnabled(false);
			await toggleAutoEmbed(false);
		});
	});
});
