import { defaultAfterRefresh } from '@/features/llm';
import type { ModelInfo } from '@/features/llm';

const model = (id: string): ModelInfo => ({ id, name: id, provider: 'openai', capabilities: ['chat'], enabled: true });

describe('defaultAfterRefresh', () => {
	it('clears a default the refreshed provider no longer lists', () => {
		expect(defaultAfterRefresh('openai:gpt-old', [model('openai:gpt-old')], [model('openai:gpt-4o')])).toBe('');
	});

	it('keeps a default the refreshed provider still lists', () => {
		expect(defaultAfterRefresh('openai:gpt-4o', [model('openai:gpt-4o')], [model('openai:gpt-4o')])).toBe('openai:gpt-4o');
	});

	it('keeps a default that belongs to another provider', () => {
		expect(defaultAfterRefresh('ollama:qwen3.5:0.8b', [model('openai:gpt-old')], [model('openai:gpt-4o')])).toBe('ollama:qwen3.5:0.8b');
	});
});
