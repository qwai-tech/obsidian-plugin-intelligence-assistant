import type { RAGConfig } from '@/features/knowledge';
import type { DocumentChunk, SearchResult } from './rag-types';

const PATH_BOOST = 0.3;
const PATH_KEYWORD_BONUS = 0.5;

export function vectorNorm(vector: number[]): number {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares);
}

export function cosine(query: number[], queryNorm: number, vector: number[], vectorNormValue: number): number {
  if (vector.length !== query.length || queryNorm === 0 || vectorNormValue === 0) {
    return 0;
  }
  let dot = 0;
  for (let i = 0; i < vector.length; i++) {
    dot += query[i] * vector[i];
  }
  return dot / (queryNorm * vectorNormValue);
}

export function boostByPath(contentSimilarity: number, query: string, chunk: DocumentChunk): number {
  const words = queryWords(query);
  const path = chunk.metadata.path.toLowerCase();
  const title = (chunk.metadata.title || '').toLowerCase();
  const matches = words.filter(word => path.includes(word) || title.includes(word)).length;
  return matches > 0 ? Math.min(contentSimilarity + (matches / words.length) * PATH_BOOST, 1) : contentSimilarity;
}

export function keywordSimilarity(query: string, chunk: DocumentChunk): number {
  const words = queryWords(query);
  const content = chunk.content.toLowerCase();
  const path = chunk.metadata.path.toLowerCase();
  const title = (chunk.metadata.title || '').toLowerCase();
  let contentMatches = 0;
  let pathMatches = 0;
  for (const word of words) {
    if (content.includes(word)) contentMatches++;
    if (path.includes(word)) pathMatches++;
    if (title.includes(word)) pathMatches++;
  }
  const score = pathMatches > 0 ? pathMatches / words.length + PATH_KEYWORD_BONUS : contentMatches / words.length;
  return Math.min(score, 1);
}

export function rankResults(results: SearchResult[], config: Pick<RAGConfig, 'similarityThreshold' | 'topK'>): SearchResult[] {
  const threshold = config.similarityThreshold;
  const kept = threshold !== undefined && threshold > 0 ? results.filter(result => result.similarity >= threshold) : results;
  return [...kept].sort((a, b) => b.similarity - a.similarity).slice(0, config.topK);
}

function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(word => word.length > 0);
}
