import { fitContextBudget } from '@/adapters/rag/context-budget';

const source = (path: string, chars: number) => ({ path, content: 'x'.repeat(chars), similarity: 0.9 });

describe('fitContextBudget', () => {
	it('keeps the best sources that fit the token budget and trims the one that crosses it', () => {
		const fitted = fitContextBudget([source('a.md', 400), source('b.md', 400), source('c.md', 400)], 150);

		expect(fitted.map(s => [s.path, s.content.length])).toEqual([['a.md', 400], ['b.md', 200]]);
	});

	it('keeps everything that fits', () => {
		expect(fitContextBudget([source('a.md', 40)], 4_000)).toHaveLength(1);
	});

	it('treats a missing or invalid budget as no limit', () => {
		expect(fitContextBudget([source('a.md', 40_000)], 0)).toHaveLength(1);
	});
});
