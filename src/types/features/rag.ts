/**
 * RAG Feature Types
 * Types for Retrieval-Augmented Generation
 */

export interface RAGConfig {
	enabled: boolean;
	chunkSize: number;
	chunkOverlap: number;
	topK: number;
	embeddingModel: string;
	vectorStore: string;
	embedChangedFiles: boolean;
	similarityThreshold: number;
	relevanceScoreWeight: number;
	searchType: string;
	maxTokensPerChunk: number;
	minChunkSize: number;
	enableCompression: boolean;
	embeddingBatchSize: number;
	indexingMode: string;
	excludeFolders: string[];
	includeFileTypes: string[];
	excludeFileTypes: string[];
	contextWindowLimit: number;
	enableSemanticCaching: boolean;
	cacheSize: number;
	filterByTag: string[];
	excludeByTag: string[];
	chunkingStrategy: string;
	reRankingEnabled: boolean;
	reRankingModel: string;
	enableGradingThreshold: boolean;
	graderModelSource: string;
	graderParallelProcessing: number;
	graderPromptTemplate?: string;
	graderModel?: string;
	minRelevanceScore?: number;
	minAccuracyScore?: number;
	minSupportQualityScore?: number;
}

export interface RAGSource {
	path: string;
	content: string;
	similarity: number;
	title?: string;
}
