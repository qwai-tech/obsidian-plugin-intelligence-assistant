import type { RAGSource } from '@/features/knowledge';

const CHARS_PER_TOKEN = 4;

export function fitContextBudget(sources: RAGSource[], maxTokens: number): RAGSource[] {
	if (!(maxTokens > 0)) return sources;
	let remaining = maxTokens * CHARS_PER_TOKEN;
	const fitted: RAGSource[] = [];
	for (const source of sources) {
		if (remaining <= 0) break;
		fitted.push(source.content.length <= remaining ? source : { ...source, content: source.content.slice(0, remaining) });
		remaining -= source.content.length;
	}
	return fitted;
}
