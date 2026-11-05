export interface DocumentChunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    path: string;
    title?: string;
    timestamp: number;
    contentHash?: string;
    embeddingModel?: string;
    agentId?: string;
    entryId?: string;
    memoryMode?: 'short-term' | 'long-term';
  };
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}
