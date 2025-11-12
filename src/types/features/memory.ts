/**
 * Memory Feature Types
 * Types for agent memory and embeddings
 */

import type { ConversationSummary } from '../core/conversation';

export interface MemoryEmbeddingMetadata {
	conversationId: string;
	timestamp: number;
	importance?: number;
}

export interface MemoryEmbedding {
	id: string;
	content: string;
	embedding: number[];
	metadata: MemoryEmbeddingMetadata;
}

export interface AgentMemory {
	agentId: string;
	conversationSummaries: ConversationSummary[];
	embeddings: MemoryEmbedding[];
}
