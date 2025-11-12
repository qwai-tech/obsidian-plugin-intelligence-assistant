/**
 * RAG Service
 * Unified interface for Retrieval-Augmented Generation operations
 */

import type { App, TFile } from 'obsidian';
import { BaseService } from './base-service';
import { RAGManager } from '@/infrastructure/rag-manager';
import { EmbeddingManager } from '@/infrastructure/embedding-manager';
import type { RAGConfig, RAGSource } from '@/types';

export interface RAGSearchOptions {
	topK?: number;
	similarityThreshold?: number;
	filterByTags?: string[];
	excludeTags?: string[];
}

export interface RAGIndexStats {
	chunkCount: number;
	fileCount: number;
	totalSize: number;
	indexedFiles: string[];
	lastIndexed?: number;
}

export class RAGService extends BaseService {
	private ragManager: RAGManager | null = null;
	private embeddingManager: EmbeddingManager | null = null;

	constructor(
		private app: App,
		private config: RAGConfig
	) {
		super();
	}

	async initialize(): Promise<void> {
		if (!this.config.enabled) {
			this.ready = false;
			return;
		}

		try {
			// EmbeddingManager doesn't require construction, uses static methods
			// RAGManager needs app, config, and llmConfigs (empty array as fallback)
			this.ragManager = new RAGManager(
				this.app,
				this.config,
				[] // LLMConfigs would need to be passed from plugin settings
			);

			await this.ragManager.initialize();
			this.ready = true;
		} catch (error) {
			console.error('[RAGService] Initialization failed:', error);
			this.ready = false;
			throw error;
		}
	}

	async cleanup(): Promise<void> {
		this.ragManager = null;
		this.embeddingManager = null;
		this.ready = false;
	}

	/**
	 * Search for relevant documents
	 */
	async search(query: string, options?: RAGSearchOptions): Promise<RAGSource[]> {
		if (!this.ragManager) {
			throw new Error('RAG service not initialized');
		}

		const threshold = options?.similarityThreshold || this.config.similarityThreshold;

		const results = await this.ragManager.query(query);

		// Convert SearchResult to RAGSource and filter by similarity threshold
		let filtered: RAGSource[] = results
			.filter((r: any) => r.score >= threshold)
			.map((r: any) => ({
				path: r.file || r.metadata?.file || 'unknown',
				content: r.content,
				similarity: r.score,
				title: r.metadata?.title
			}));

		// Filter by tags if specified
		if (options?.filterByTags && options.filterByTags.length > 0) {
			// Tag filtering logic would go here
		}

		if (options?.excludeTags && options.excludeTags.length > 0) {
			// Tag exclusion logic would go here
		}

		return filtered;
	}

	/**
	 * Index a file
	 */
	async indexFile(file: TFile): Promise<void> {
		if (!this.ragManager) {
			throw new Error('RAG service not initialized');
		}

		await this.ragManager.indexFile(file);
	}

	/**
	 * Index multiple files
	 */
	async indexFiles(files: TFile[]): Promise<void> {
		for (const file of files) {
			await this.indexFile(file);
		}
	}

	/**
	 * Rebuild entire index
	 */
	async rebuildIndex(): Promise<void> {
		if (!this.ragManager) {
			throw new Error('RAG service not initialized');
		}

		await this.ragManager.refreshIndex();
	}

	/**
	 * Clear index
	 */
	async clearIndex(): Promise<void> {
		if (!this.ragManager) {
			throw new Error('RAG service not initialized');
		}

		await this.ragManager.clearIndex();
	}

	/**
	 * Get index statistics
	 */
	async getStats(): Promise<RAGIndexStats> {
		if (!this.ragManager) {
			throw new Error('RAG service not initialized');
		}

		const stats = await this.ragManager.getDetailedStats();

		return {
			chunkCount: stats.chunkCount || 0,
			fileCount: stats.fileCount || 0,
			totalSize: stats.totalSize || 0,
			indexedFiles: stats.indexedFiles || []
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: RAGConfig): void {
		this.config = config;
	}

	/**
	 * Check if RAG is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled && this.ready;
	}

	/**
	 * Get RAG manager instance (for advanced operations)
	 */
	getManager(): RAGManager | null {
		return this.ragManager;
	}
}
