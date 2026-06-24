import { toOpenAiWireMessage, toOpenAiWireMessages } from '@/infrastructure/llm/openai-message';
import type { Message } from '@/types';

describe('toOpenAiWireMessage — wire sanitization', () => {
	it('strips internal bookkeeping fields (model, reasoning_content) strict servers reject', () => {
		const msg = {
			role: 'assistant',
			content: '',
			model: 'deepseek/deepseek-v4-pro',
			reasoning_content: 'chain of thought',
			tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
		} as unknown as Message;

		const wire = toOpenAiWireMessage(msg);

		expect(wire).toEqual({
			role: 'assistant',
			content: '',
			tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
		});
		expect('model' in wire).toBe(false);
		expect('reasoning_content' in wire).toBe(false);
	});

	it('preserves tool messages (tool_call_id + content)', () => {
		const msg = { role: 'tool', content: 'AGENT_TOOL_SENTINEL', tool_call_id: 'c1' } as unknown as Message;
		expect(toOpenAiWireMessage(msg)).toEqual({ role: 'tool', content: 'AGENT_TOOL_SENTINEL', tool_call_id: 'c1' });
	});

	it('keeps a plain user message as role + content', () => {
		const msg = { role: 'user', content: 'hello' } as Message;
		expect(toOpenAiWireMessage(msg)).toEqual({ role: 'user', content: 'hello' });
	});

	it('expands image attachments into a multimodal content array', () => {
		const msg = {
			role: 'user',
			content: 'describe',
			attachments: [{ type: 'image', name: 'd.png', path: 'd.png', content: 'data:image/png;base64,abc' }],
		} as unknown as Message;

		const wire = toOpenAiWireMessage(msg);
		expect(wire.content).toEqual([
			{ type: 'text', text: 'describe' },
			{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
		]);
		// attachments themselves must not leak onto the wire message.
		expect('attachments' in wire).toBe(false);
	});

	it('maps an array', () => {
		const out = toOpenAiWireMessages([
			{ role: 'system', content: 's' } as Message,
			{ role: 'user', content: 'u' } as Message,
		]);
		expect(out).toEqual([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }]);
	});
});
