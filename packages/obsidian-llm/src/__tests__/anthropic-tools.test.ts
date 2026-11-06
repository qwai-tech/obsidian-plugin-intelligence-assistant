import { AnthropicProvider } from '../providers/anthropic-provider';
import type { HttpPort, HttpRequest } from '../http';
import type { ChatRequest, LLMMessage, StreamChunk } from '../types';

const encoder = new TextEncoder();

const portStreaming = (events: unknown[]) => {
	const requests: HttpRequest[] = [];
	const port = {
		request: jest.fn(),
		stream: jest.fn(async (req: HttpRequest) => {
			requests.push(req);
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')));
					controller.close();
				},
			});
			return { status: 200, ok: true, body, text: async () => '' };
		}),
	} as unknown as HttpPort;
	return { port, requests };
};

const readTool = {
	type: 'function' as const,
	function: { name: 'read_file', description: 'Read a note', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
};

const run = async (request: Partial<ChatRequest>, events: unknown[] = [{ type: 'message_stop' }]) => {
	const { port, requests } = portStreaming(events);
	const chunks: StreamChunk[] = [];
	await new AnthropicProvider({ provider: 'anthropic', apiKey: 'k' }, port).streamChat({ model: 'claude-x', messages: [], ...request } as ChatRequest, (c) => chunks.push(c));
	return { body: JSON.parse(requests[0].body ?? '{}') as Record<string, unknown>, chunks };
};

describe('Anthropic tool calling', () => {
	it('encodes tools and tool choice in Anthropic form', async () => {
		const { body } = await run({ tools: [readTool], toolChoice: { type: 'function', function: { name: 'read_file' } } });

		expect(body.tools).toEqual([{ name: 'read_file', description: 'Read a note', input_schema: readTool.function.parameters }]);
		expect(body.tool_choice).toEqual({ type: 'tool', name: 'read_file' });
	});

	it('maps auto and required tool choice', async () => {
		expect((await run({ tools: [readTool], toolChoice: 'auto' })).body.tool_choice).toEqual({ type: 'auto' });
		expect((await run({ tools: [readTool], toolChoice: 'required' })).body.tool_choice).toEqual({ type: 'any' });
	});

	it('turns tool calls and their results in the history into tool_use and tool_result blocks', async () => {
		const messages = [
			{ role: 'system', content: 'be brief' },
			{ role: 'user', content: 'read two notes' },
			{
				role: 'assistant',
				content: 'Reading.',
				tool_calls: [
					{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.md"}' } },
					{ id: 'c2', type: 'function', function: { name: 'read_file', arguments: '{"path":"b.md"}' } },
				],
			},
			{ role: 'tool', tool_call_id: 'c1', content: 'A' },
			{ role: 'tool', tool_call_id: 'c2', content: 'B' },
		] as unknown as LLMMessage[];

		const { body } = await run({ messages, tools: [readTool] });

		expect(body.system).toBe('be brief');
		expect(body.messages).toEqual([
			{ role: 'user', content: 'read two notes' },
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: 'Reading.' },
					{ type: 'tool_use', id: 'c1', name: 'read_file', input: { path: 'a.md' } },
					{ type: 'tool_use', id: 'c2', name: 'read_file', input: { path: 'b.md' } },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'c1', content: 'A' },
					{ type: 'tool_result', tool_use_id: 'c2', content: 'B' },
				],
			},
		]);
	});

	it('streams tool_use blocks back as tool calls with usage', async () => {
		const { chunks } = await run({ tools: [readTool] }, [
			{ type: 'message_start', message: { usage: { input_tokens: 12 } } },
			{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
			{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me look.' } },
			{ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'read_file' } },
			{ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
			{ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"a.md"}' } },
			{ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } },
			{ type: 'message_stop' },
		]);

		expect(chunks.filter((c) => c.content).map((c) => c.content)).toEqual(['Let me look.']);
		expect(chunks.flatMap((c) => c.toolCalls ?? [])).toEqual([
			{ id: 'tu_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.md"}' } },
		]);
		expect(chunks.find((c) => c.usage)?.usage).toEqual({ promptTokens: 12, completionTokens: 7, totalTokens: 19 });
	});
});
