import type { RAGSource } from '@/types';

export interface KnowledgeBase {
	search(query: string, chatModel?: string, defaultModel?: string): Promise<RAGSource[]>;
}

export interface MemoryIndex {
	indexMemory(agentId: string, content: string): Promise<void>;
}
