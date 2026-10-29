import type { RAGSource } from '@/features/knowledge/types/rag';

export interface KnowledgeBase {
	search(query: string, chatModel?: string, defaultModel?: string): Promise<RAGSource[]>;
}

export interface MemoryIndex {
	indexMemory(agentId: string, content: string): Promise<void>;
}
