import { ProviderModelPort } from '@/features/agent/kernel/provider-model-port';
import type { KernelEvent } from '@/features/agent/types/agent-run';
import type { StreamChunk } from '@/features/llm/types/llm';

describe('ProviderModelPort', () => {
	it('collects one turn and streams text and reasoning as events', async () => {
		const provider = {
			streamChat: jest.fn(async (_request: unknown, onChunk: (chunk: StreamChunk) => void) => {
				onChunk({ content: '', done: false, reasoning: 'think' });
				onChunk({ content: 'Hel', done: false });
				onChunk({ content: 'lo', done: false });
				onChunk({ content: '', done: false, toolCalls: [{ id: 't1', type: 'function', function: { name: 'read', arguments: '{"path":"a.md"}' } }] });
				onChunk({ content: '', done: true, usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } });
			}),
			chat: jest.fn(),
		};
		const events: KernelEvent[] = [];

		const turn = await new ProviderModelPort(provider as never).turn({ model: 'm', messages: [] }, (e) => events.push(e));

		expect(turn).toEqual({
			text: 'Hello',
			reasoning: 'think',
			calls: [{ id: 't1', name: 'read', arguments: { path: 'a.md' } }],
			usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
		});
		expect(events).toEqual([
			{ type: 'reasoning_delta', text: 'think' },
			{ type: 'text_delta', text: 'Hel' },
			{ type: 'text_delta', text: 'lo' },
		]);
	});
});
