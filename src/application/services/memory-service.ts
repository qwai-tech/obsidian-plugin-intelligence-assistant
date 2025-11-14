/**
 * Memory Service
 * Manages agent memory, conversation summaries, and embeddings
 */

import { BaseService } from './base-service';
import { AgentMemoryManager } from '@/memory/agent-memory';
import type { App } from 'obsidian';
import type {
	Agent,
	AgentMemory,
	Conversation,
	ConversationSummary,
	MemoryEmbedding
} from '@/types';

export interface MemorySearchOptions {
	maxResults?: number;
	similarityThreshold?: number;
	timeRange?: {
		start: number;
		end: number;
	};
}

export class MemoryService extends BaseService {
	private memoryManager: AgentMemoryManager | null = null;
	private memories: Map<string, AgentMemory> = new Map();

	constructor(
		private _app: App
	) {
		super();
	}

	async initialize(): Promise<void> {
		this.memoryManager = new AgentMemoryManager(this._app.vault);
		await this.memoryManager.initialize();
		this.ready = true;
	}

	cleanup(): Promise<void> {
		this.memoryManager = null;
		this.memories.clear();
		this.ready = false;
	  return Promise.resolve();
	}

	/**
	 * Get memory for agent
	 */
	getMemory(agentId: string): AgentMemory | null {
		return this.memories.get(agentId) || null;
	}

	/**
	 * Save memory for agent
	 */
	setMemory(agentId: string, memory: AgentMemory): void {
		this.memories.set(agentId, memory);
	}

	/**
	 * Record a conversation
	 */
	recordConversation(
		agent: Agent,
		conversation: Conversation
	): Promise<void> {
		if (!this.memoryManager) {
			throw new Error('Memory service not initialized');
		}

		// Create a basic summary for the conversation
		const summary = conversation.title || 'Conversation';
		const messageCount = conversation.messages.length;

		this.memoryManager.addConversationSummary(
			agent.id,
			conversation.id,
			summary,
			messageCount
		);

		// Update local cache
		const memory = this.memoryManager.getMemory(agent.id);
		if (memory) {
			this.setMemory(agent.id, memory);
		}
	  return Promise.resolve();
	}

	/**
	 * Get conversation summaries for agent
	 */
	getConversationSummaries(agentId: string): ConversationSummary[] {
		const memory = this.getMemory(agentId);
		return memory?.conversationSummaries ?? [];
	}

	/**
	 * Add conversation summary
	 */
	addConversationSummary(
		agentId: string,
		summary: ConversationSummary
	): void {
		const memory = this.getMemory(agentId) || {
			agentId,
			conversationSummaries: [],
			embeddings: []
		};

		memory.conversationSummaries.push(summary);
		this.setMemory(agentId, memory);
	}

	/**
	 * Search memories by semantic similarity
	 */
	searchMemories(
		agentId: string,
		_query: string,
		_options?: MemorySearchOptions
	): Promise<MemoryEmbedding[]> {
		if (!this.memoryManager) {
			throw new Error('Memory service not initialized');
		}

		const memory = this.getMemory(agentId);
		if (!memory) return Promise.resolve([]);

		// TODO: Implement semantic search using embeddings
		// For now, return empty array
		return Promise.resolve([]);
	}

	/**
	 * Get recent conversations
	 */
	getRecentConversations(
		agentId: string,
		limit: number = 10
	): ConversationSummary[] {
		const summaries = this.getConversationSummaries(agentId);
		return summaries
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, limit);
	}

	/**
	 * Clear memory for agent
	 */
	clearMemory(agentId: string): void {
		this.memories.delete(agentId);
	}

	/**
	 * Get memory stats
	 */
	getStats(agentId: string): {
		conversationCount: number;
		embeddingCount: number;
		totalMessages: number;
	} {
		const memory = this.getMemory(agentId);
		if (!memory) {
			return {
				conversationCount: 0,
				embeddingCount: 0,
				totalMessages: 0
			};
		}

		const totalMessages = memory.conversationSummaries.reduce(
			(sum, summary) => sum + summary.messageCount,
			0
		);

		return {
			conversationCount: memory.conversationSummaries.length,
			embeddingCount: memory.embeddings.length,
			totalMessages
		};
	}

	/**
	 * Load memories from storage
	 */
	loadMemories(memories: AgentMemory[]): Promise<void> {
		this.memories.clear();
		for (const memory of memories) {
			this.memories.set(memory.agentId, memory);
		}
	  return Promise.resolve();
	}

	/**
	 * Export all memories
	 */
	exportMemories(): AgentMemory[] {
		return Array.from(this.memories.values());
	}
}
