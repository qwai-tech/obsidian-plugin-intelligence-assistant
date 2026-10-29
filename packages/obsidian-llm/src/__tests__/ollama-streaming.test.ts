import { OllamaProvider } from '../providers/ollama-provider';
import { StreamTransportUnavailableError, type HttpPort, type HttpRequest } from '../http';
import type { ChatRequest, LLMMessage, StreamChunk } from '../types';

const encoder = new TextEncoder();

const ndjson = (lines: unknown[]) => new ReadableStream<Uint8Array>({
	start(controller) {
		controller.enqueue(encoder.encode(lines.map((line) => JSON.stringify(line)).join('\n') + '\n'));
		controller.close();
	},
});

const streamingPort = (lines: unknown[]) => {
	const requests: HttpRequest[] = [];
	const port = {
		request: jest.fn(),
		stream: jest.fn(async (req: HttpRequest) => {
			requests.push(req);
			return { status: 200, ok: true, body: ndjson(lines), text: async () => '' };
		}),
	} as unknown as HttpPort;
	return { port, requests };
};

const listTool = { type: 'function' as const, function: { name: 'list_files', description: 'List files', parameters: { type: 'object', properties: {} } } };

const run = async (port: HttpPort, request: Partial<ChatRequest> = {}) => {
	const chunks: StreamChunk[] = [];
	await new OllamaProvider({ provider: 'ollama' }, port).streamChat({ model: 'ollama:llama3', messages: [], ...request } as ChatRequest, (c) => chunks.push(c));
	return chunks;
};

describe('Ollama streaming and tools', () => {
	it('streams content over the stream transport and reports usage at the end', async () => {
		const { port, requests } = streamingPort([
			{ message: { content: 'Hel' }, done: false },
			{ message: { content: 'lo' }, done: false },
			{ message: { content: '' }, done: true, prompt_eval_count: 4, eval_count: 2 },
		]);

		const chunks = await run(port);

		expect(requests[0].url).toBe('http://localhost:11434/api/chat');
		expect(chunks.filter((c) => c.content).map((c) => c.content)).toEqual(['Hel', 'lo']);
		expect(chunks[chunks.length - 1]).toEqual({ content: '', done: true, usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } });
	});

	it('sends tools and turns streamed tool calls into calls with ids and JSON arguments', async () => {
		const { port, requests } = streamingPort([
			{ message: { content: '', tool_calls: [{ function: { name: 'list_files', arguments: { folder: 'Notes' } } }] }, done: false },
			{ message: { content: '' }, done: true },
		]);

		const chunks = await run(port, { tools: [listTool] });

		expect((JSON.parse(requests[0].body ?? '{}') as { tools: unknown }).tools).toEqual([listTool]);
		const calls = chunks.flatMap((c) => c.toolCalls ?? []);
		expect(calls).toHaveLength(1);
		expect(calls[0].function).toEqual({ name: 'list_files', arguments: '{"folder":"Notes"}' });
		expect(calls[0].id).toMatch(/\S/);
	});

	it('replays earlier tool call arguments as objects', async () => {
		const { port, requests } = streamingPort([{ message: { content: 'ok' }, done: true }]);
		const messages = [
			{ role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_files', arguments: '{"folder":"Notes"}' } }] },
			{ role: 'tool', tool_call_id: 'c1', content: 'a.md' },
		] as unknown as LLMMessage[];

		await run(port, { messages, tools: [listTool] });

		const sent = (JSON.parse(requests[0].body ?? '{}') as { messages: Array<{ tool_calls?: Array<{ function: { arguments: unknown } }> }> }).messages;
		expect(sent[0].tool_calls?.[0].function.arguments).toEqual({ folder: 'Notes' });
	});

	it('falls back to one buffered request when the stream transport is blocked', async () => {
		const port = {
			request: jest.fn(async () => ({
				status: 200,
				ok: true,
				text: '',
				headers: {},
				json: { message: { content: 'buffered', tool_calls: [{ function: { name: 'list_files', arguments: {} } }] }, prompt_eval_count: 1, eval_count: 1 },
			})),
			stream: jest.fn(async () => { throw new StreamTransportUnavailableError('cors'); }),
		} as unknown as HttpPort;

		const chunks = await run(port, { tools: [listTool] });

		expect(chunks.filter((c) => c.content).map((c) => c.content)).toEqual(['buffered']);
		expect(chunks.flatMap((c) => c.toolCalls ?? []).map((c) => c.function.name)).toEqual(['list_files']);
		expect(chunks[chunks.length - 1].done).toBe(true);
	});

	it('sends images in Ollama\'s native images field', async () => {
		const { port, requests } = streamingPort([{ message: { content: 'a cat' }, done: true }]);
		const messages = [{ role: 'user', content: 'what is this?', attachments: [{ type: 'image', name: 'cat.png', content: 'data:image/png;base64,QUJD' }] }] as LLMMessage[];

		await run(port, { messages });

		const sent = (JSON.parse(requests[0].body ?? '{}') as { messages: Array<{ content: unknown; images?: string[] }> }).messages;
		expect(sent[0]).toEqual({ role: 'user', content: 'what is this?', images: ['QUJD'] });
	});
});
