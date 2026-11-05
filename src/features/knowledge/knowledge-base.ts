import type { RAGSource } from '@/features/knowledge/types/rag';

export interface RetrievalScope {
	agentId?: string;
	memoryMode?: 'none' | 'short-term' | 'long-term';
	signal?: AbortSignal;
}
export interface MemoryWriteOptions {
	signal?: AbortSignal;
	mode?: 'short-term' | 'long-term';
	maxEntries?: number;
}
export interface KnowledgeBase {
	search(query: string, chatModel?: string, defaultModel?: string, scope?: RetrievalScope): Promise<RAGSource[]>;
}

export interface MemoryIndex {
	indexMemory(agentId: string, content: string, options?: MemoryWriteOptions): Promise<void>;
}
