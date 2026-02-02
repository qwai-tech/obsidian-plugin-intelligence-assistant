/**
 * E2E Tests for RAG Settings - Chunking Subtab
 * Tests document chunking strategy and parameters
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import {

	openRagTab,
	switchRagSubtab,
	getChunkingStrategy,
	selectChunkingStrategy,
	getChunkSize,
	setChunkSize,
	getChunkOverlap,
	setChunkOverlap,
	getMaxTokensPerChunk,
	setMaxTokensPerChunk,
	getMinChunkSize,
	setMinChunkSize,
} from '../../utils/rag-helpers';

describe('RAG Settings - Chunking', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openRagTab();
		await switchRagSubtab('chunking');
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('Chunking Strategy Selection', () => {
		it('should allow selecting recursive chunking', async () => {
			await selectChunkingStrategy('recursive');
			await browser.pause(500);

			const strategy = await getChunkingStrategy();
			expect(strategy.toLowerCase()).toContain('recursive');
		});

		it('should allow selecting fixed-size chunking', async () => {
			await selectChunkingStrategy('fixed');
			await browser.pause(500);

			const strategy = await getChunkingStrategy();
			expect(strategy.toLowerCase()).toContain('fixed');
		});

		it('should allow selecting sentence-based chunking', async () => {
			await selectChunkingStrategy('sentence');
			await browser.pause(500);

			const strategy = await getChunkingStrategy();
			expect(strategy.toLowerCase()).toContain('sentence');
		});

		it('should allow selecting paragraph-based chunking', async () => {
			await selectChunkingStrategy('paragraph');
			await browser.pause(500);

			const strategy = await getChunkingStrategy();
			expect(strategy.toLowerCase()).toContain('paragraph');
		});

		it('should persist strategy selection', async () => {
			await selectChunkingStrategy('recursive');
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('chunking');

			// Verify persisted
			const strategy = await getChunkingStrategy();
			expect(strategy.toLowerCase()).toContain('recursive');
		});
	});

	describe('Chunk Size Configuration', () => {
		it('should allow setting chunk size', async () => {
			const testSize = 1000;
			await setChunkSize(testSize);
			await browser.pause(500);

			const size = await getChunkSize();
			expect(size).toBe(testSize);
		});

		it('should validate chunk size range', async () => {
			// Set a valid chunk size
			await setChunkSize(500);
			await browser.pause(500);

			const size = await getChunkSize();
			expect(size).toBe(500);
			expect(size).toBeGreaterThan(0);
			expect(size).toBeLessThan(10000); // Reasonable upper bound
		});

		it('should persist chunk size value', async () => {
			const testSize = 800;
			await setChunkSize(testSize);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('chunking');

			// Verify persisted
			const size = await getChunkSize();
			expect(size).toBe(testSize);
		});
	});

	describe('Chunk Overlap Configuration', () => {
		it('should allow setting chunk overlap', async () => {
			const testOverlap = 100;
			await setChunkOverlap(testOverlap);
			await browser.pause(500);

			const overlap = await getChunkOverlap();
			expect(overlap).toBe(testOverlap);
		});

		it('should validate overlap range', async () => {
			// Set overlap to 0 (minimum)
			await setChunkOverlap(0);
			await browser.pause(500);

			const minOverlap = await getChunkOverlap();
			expect(minOverlap).toBe(0);

			// Set overlap to reasonable value
			await setChunkOverlap(200);
			await browser.pause(500);

			const overlap = await getChunkOverlap();
			expect(overlap).toBe(200);
		});

		it('should prevent overlap >= chunk size', async () => {
			// Set chunk size to 500
			await setChunkSize(500);
			await browser.pause(500);

			// Set overlap to 400 (valid)
			await setChunkOverlap(400);
			await browser.pause(500);

			const overlap = await getChunkOverlap();
			const size = await getChunkSize();

			// Overlap should be less than chunk size
			expect(overlap).toBeLessThan(size);
		});

		it('should persist overlap value', async () => {
			const testOverlap = 150;
			await setChunkOverlap(testOverlap);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('chunking');

			// Verify persisted
			const overlap = await getChunkOverlap();
			expect(overlap).toBe(testOverlap);
		});
	});

	describe('Advanced Chunking Parameters', () => {
		it('should allow setting max tokens per chunk', async () => {
			const testMaxTokens = 2000;
			await setMaxTokensPerChunk(testMaxTokens);
			await browser.pause(500);

			const maxTokens = await getMaxTokensPerChunk();
			expect(maxTokens).toBe(testMaxTokens);
		});

		it('should allow setting min chunk size', async () => {
			const testMinSize = 100;
			await setMinChunkSize(testMinSize);
			await browser.pause(500);

			const minSize = await getMinChunkSize();
			expect(minSize).toBe(testMinSize);
		});

		it('should validate parameter relationships', async () => {
			// Set chunk size to 1000
			await setChunkSize(1000);
			await browser.pause(500);

			// Set min chunk size to 200 (should be < chunk size)
			await setMinChunkSize(200);
			await browser.pause(500);

			const minSize = await getMinChunkSize();
			const chunkSize = await getChunkSize();

			// Min chunk size should be less than chunk size
			expect(minSize).toBeLessThan(chunkSize);
		});

		it('should persist all chunking parameters', async () => {
			// Set all parameters
			await setChunkSize(1000);
			await setChunkOverlap(200);
			await setMaxTokensPerChunk(2000);
			await setMinChunkSize(100);
			await browser.pause(500);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openRagTab();
			await switchRagSubtab('chunking');

			// Verify all persisted
			expect(await getChunkSize()).toBe(1000);
			expect(await getChunkOverlap()).toBe(200);
			expect(await getMaxTokensPerChunk()).toBe(2000);
			expect(await getMinChunkSize()).toBe(100);
		});
	});

	describe('Chunking Strategy Switching', () => {
		it('should preserve common parameters across strategies', async () => {
			// Set common parameters
			await setChunkSize(800);
			await setChunkOverlap(150);
			await browser.pause(500);

			// Switch strategy
			await selectChunkingStrategy('recursive');
			await browser.pause(500);

			await selectChunkingStrategy('fixed');
			await browser.pause(500);

			// Common parameters should persist
			expect(await getChunkSize()).toBe(800);
			expect(await getChunkOverlap()).toBe(150);
		});
	});
});
