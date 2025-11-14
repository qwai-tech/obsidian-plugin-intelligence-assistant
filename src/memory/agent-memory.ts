import { Vault } from 'obsidian';
import type { AgentMemory, ConversationSummary, MemoryEmbedding, Message, ILLMProvider } from '@/types';

function cloneMemory(memory: AgentMemory): AgentMemory {
  return {
    agentId: memory.agentId,
    conversationSummaries: memory.conversationSummaries.map(summary => ({ ...summary })),
    embeddings: memory.embeddings.map(embedding => ({
      ...embedding,
      metadata: { ...embedding.metadata }
    }))
  };
}

export class AgentMemoryManager {
  private memories = new Map<string, AgentMemory>();
  private ready = false;

  constructor(private _vault: Vault, initialMemories: AgentMemory[] = []) {
    initialMemories.forEach(memory => this.memories.set(memory.agentId, cloneMemory(memory)));
  }

  initialize(): Promise<void> {
    this.ready = true;
    return Promise.resolve();
  }

  private ensureReady(): void {
    if (!this.ready) {
      throw new Error('AgentMemoryManager not initialized');
    }
  }

  getMemory(agentId: string): AgentMemory | null {
    const memory = this.memories.get(agentId);
    return memory ? cloneMemory(memory) : null;
  }

  setMemory(agentId: string, memory: AgentMemory): void {
    this.ensureReady();
    this.memories.set(agentId, cloneMemory(memory));
  }

  addConversationSummary(agentId: string, conversationId: string, summary: string, messageCount: number): void {
    this.ensureReady();
    const memory = this.getMemory(agentId) ?? { agentId, conversationSummaries: [], embeddings: [] };
    const entry: ConversationSummary = {
      conversationId,
      summary,
      timestamp: Date.now(),
      messageCount
    };
    memory.conversationSummaries.unshift(entry);
    this.setMemory(agentId, memory);
  }

  getRecentSummaries(agentId: string, limit: number = 5): ConversationSummary[] {
    const memory = this.memories.get(agentId);
    return memory ? memory.conversationSummaries.slice(0, limit) : [];
  }

  addEmbedding(agentId: string, embedding: MemoryEmbedding): Promise<void> {
    this.ensureReady();
    const memory = this.getMemory(agentId) ?? { agentId, conversationSummaries: [], embeddings: [] };
    memory.embeddings.push(embedding);
    this.setMemory(agentId, memory);
    return Promise.resolve();
  }

  generateSummary(messages: Message[], _provider: ILLMProvider, _modelId: string): Promise<string> {
    const combined = messages.map(m => m.content).join(' ').slice(0, 500);
    return Promise.resolve(combined || 'No summary available');
  }

  exportMemories(): AgentMemory[] {
    return Array.from(this.memories.values()).map(cloneMemory);
  }
}
