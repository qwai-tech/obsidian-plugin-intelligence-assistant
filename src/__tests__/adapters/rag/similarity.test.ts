import { boostByPath, cosine, keywordSimilarity, rankResults, vectorNorm } from '@/adapters/rag/similarity';
import type { DocumentChunk } from '@/adapters/rag/rag-types';

const chunk = (id: string, content: string, path = 'notes/x.md', title?: string): DocumentChunk => ({
	id, content, metadata: { source: 'vault', path, title, timestamp: 0 },
});

describe('similarity', () => {
	it('computes cosine similarity with precomputed norms', () => {
		const a = [1, 0];
		const b = [1, 1];
		expect(cosine(a, vectorNorm(a), b, vectorNorm(b))).toBeCloseTo(Math.SQRT1_2);
		expect(cosine(a, 0, b, vectorNorm(b))).toBe(0);
		expect(cosine(a, 1, [1, 0, 0], 1)).toBe(0);
	});

	it('boosts content similarity by query words found in path or title, capped at 1', () => {
		expect(boostByPath(0.5, 'alpha beta', chunk('c', '', 'alpha/note.md'))).toBeCloseTo(0.65);
		expect(boostByPath(0.5, 'zeta', chunk('c', '', 'alpha/note.md'))).toBe(0.5);
		expect(boostByPath(0.95, 'alpha', chunk('c', '', 'alpha.md'))).toBe(1);
	});

	it('scores keyword matches, preferring path and title hits', () => {
		expect(keywordSimilarity('cat dog', chunk('c', 'a cat sat'))).toBe(0.5);
		expect(keywordSimilarity('cat', chunk('c', 'nothing', 'pets/cat.md'))).toBe(1);
		expect(keywordSimilarity('cat', chunk('c', 'nothing'))).toBe(0);
	});

	it('ranks by similarity, drops results under the threshold and keeps top K', () => {
		const results = [0.2, 0.9, 0.6, 0.4].map((similarity, i) => ({ chunk: chunk(`c${i}`, ''), similarity }));
		expect(rankResults(results, { similarityThreshold: 0.3, topK: 2 }).map(r => r.similarity)).toEqual([0.9, 0.6]);
		expect(rankResults(results, { similarityThreshold: 0, topK: 10 })).toHaveLength(4);
	});
});
