import { chunkText } from '@/infrastructure/rag/chunker';
import type { RAGConfig } from '@/types';

const config = (overrides: Partial<RAGConfig>): RAGConfig => ({ chunkSize: 40, chunkOverlap: 0, minChunkSize: 1, maxTokensPerChunk: 1000, ...overrides } as RAGConfig);

describe('chunkText', () => {
	it('returns nothing for empty content', () => {
		expect(chunkText('', config({}))).toEqual([]);
	});

	it('keeps whole paragraphs together under the paragraph strategy', () => {
		const chunks = chunkText('First para.\n\nSecond para.\n\nThird para.', config({ chunkingStrategy: 'paragraph', chunkSize: 1000 }));

		expect(chunks.join(' ')).toContain('First para.');
		expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
	});

	it('never exceeds the chunk size under the fixed strategy', () => {
		const chunks = chunkText('x'.repeat(200), config({ chunkingStrategy: 'fixed', chunkSize: 50 }));

		expect(chunks.length).toBeGreaterThanOrEqual(4);
		expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
	});

	it('treats semantic as sentence chunking', () => {
		const text = 'One sentence here. Another one follows. And a third.';

		expect(chunkText(text, config({ chunkingStrategy: 'semantic' }))).toEqual(chunkText(text, config({ chunkingStrategy: 'sentence' })));
	});

	it('loses no text when splitting sentences', () => {
		const text = 'Alpha beta gamma. Delta epsilon zeta. Eta theta iota.';
		const joined = chunkText(text, config({ chunkingStrategy: 'sentence', chunkSize: 20 })).join(' ');

		for (const word of ['Alpha', 'Delta', 'iota']) {
			expect(joined).toContain(word);
		}
	});
});
