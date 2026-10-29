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
  };
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}
