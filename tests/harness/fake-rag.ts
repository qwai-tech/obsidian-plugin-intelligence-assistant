export interface FakeRagResult { path: string; content: string; title?: string; similarity?: number; }

/** Controllable RAGManager stub: query() returns seeded results as real SearchResult[]. */
export function createFakeRagManager(results: FakeRagResult[]): unknown {
  const searchResults = results.map((r) => ({
    chunk: { content: r.content, metadata: { path: r.path, title: r.title ?? r.path } },
    similarity: r.similarity ?? 0.9,
  }));
  return {
    isReady: () => true,
    query: async () => searchResults,
    getRelevantContext: async () => results.map((r) => r.content).join('\n'),
    indexMemory: async () => undefined,
    search: async () => searchResults,
  };
}
