import { HistoryCompactor } from '@/features/agent/history-compactor';
import type { AgentWorkingMessage } from '@/features/agent/types';

describe('HistoryCompactor', () => {
	it('keeps short histories unchanged', () => {
		const compactor = new HistoryCompactor({ maxEstimatedTokens: 10000 });
		const messages: AgentWorkingMessage[] = [{ role: 'user', content: 'small request' }, { role: 'assistant', content: 'small answer' }];
		expect(compactor.compact(messages)).toMatchObject({ compacted: false, messages });
	});

	it('bounds large tool evidence while retaining policy, the latest request and valid call/result pairs', () => {
		const compactor = new HistoryCompactor({ maxEstimatedTokens: 1500 });
		const messages: AgentWorkingMessage[] = [
			{ role: 'system', content: 'base system policy' },
			{ role: 'user', content: 'Read the earlier source.' },
			{ role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.md"}' } }] },
			{ role: 'tool', tool_call_id: 'call-1', content: 'source evidence '.repeat(5000) },
			{ role: 'assistant', content: 'latest thought' },
			{ role: 'user', content: 'latest request' },
		];
		const result = compactor.compact(messages);
		expect(result.compacted).toBe(true);
		expect(result.messages[0].content).toBe('base system policy');
		expect(result.messages[result.messages.length - 1].content).toBe('latest request');
		expect(compactor.estimateMessages(result.messages)).toBeLessThanOrEqual(1500);
		const calls = new Set(result.messages.flatMap(message => 'tool_calls' in message ? (message.tool_calls ?? []).map(call => call.id) : []));
		for (const message of result.messages.filter(message => message.role === 'tool')) expect(calls.has(message.tool_call_id!)).toBe(true);
	});
});
