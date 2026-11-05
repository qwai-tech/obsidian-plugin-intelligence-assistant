/**
 * Memory Feature Types
 * Types for agent memory and embeddings
 */

import type { ConversationSummary } from '@/features/conversations';

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

export interface AgentMemorySnapshot {
	agentId: string;
	workingNotes: string[];
	researchLog: string;
	preferences: Record<string, string>;
	updatedAt: number;
	researchEntries?: string[];
	completedRuns?: number;
}

export interface AgentMemoryFile {
	version: 1;
	updatedAt: number;
	agents: Record<string, AgentMemorySnapshot>;
}
