import type { KnowledgeBase } from '@/features/knowledge/knowledge-base';

export interface FakeRagResult { path: string; content: string; title?: string; similarity?: number; }

export function createFakeKnowledgeBase(results: FakeRagResult[]): KnowledgeBase {
  const sources = results.map((r) => ({ path: r.path, content: r.content, title: r.title ?? r.path, similarity: r.similarity ?? 0.9 }));
  return { search: async () => sources };
}
