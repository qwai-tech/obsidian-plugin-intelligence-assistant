import { HistoryCompactor } from '@/application/agents';
import type { AgentWorkingMessage } from '@/application/agents';

describe('HistoryCompactor', () => {
	it('keeps short histories unchanged', () => {
		const compactor = new HistoryCompactor({ maxEstimatedTokens: 10000 });
		const messages: AgentWorkingMessage[] = [
			{ role: 'user', content: 'small request' },
			{ role: 'assistant', content: 'small answer' },
		];

		const result = compactor.compact(messages);

		expect(result.compacted).toBe(false);
		expect(result.messages).toEqual(messages);
	});

	it('replaces middle tool history with a Research Log block', () => {
		const compactor = new HistoryCompactor({ maxEstimatedTokens: 20, keepLastMessages: 2 });
		const messages: AgentWorkingMessage[] = [
			{ role: 'system', content: 'base system' },
			{ role: 'user', content: 'first question with many many many words' },
			{ role: 'assistant', content: 'tool analysis with many many many words' },
			{ role: 'tool', tool_call_id: 'call-1', content: 'tool output with many many many words' },
			{ role: 'assistant', content: 'latest thought' },
			{ role: 'user', content: 'latest request' },
		];

		const result = compactor.compact(messages);

		expect(result.compacted).toBe(true);
		expect(result.messages.some(message => message.content.includes('Research Log'))).toBe(true);
		expect(result.messages.at(-1)?.content).toBe('latest request');
		expect(result.summary).toContain('first question');
	});
});
