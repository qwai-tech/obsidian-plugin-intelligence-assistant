import { OpenAIProvider } from '../providers/openai-provider';
import { DeepSeekProvider } from '../providers/deepseek-provider';
import { OpenRouterProvider } from '../providers/openrouter-provider';
import type { HttpPort, HttpRequest } from '../http';
import type { StreamChunk } from '../types';

const encoder = new TextEncoder();

const sseBody = (events: unknown[]) => events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n`).join('');

const controllableStream = () => {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
	return {
		body,
		send: (events: unknown[]) => controller.enqueue(encoder.encode(sseBody(events))),
		close: () => controller.close(),
	};
};

const toolDelta = (index: number, fields: { id?: string; name?: string; args?: string }) => ({
	choices: [{ delta: { tool_calls: [{ index, id: fields.id, function: { name: fields.name, arguments: fields.args } }] } }],
});

const finishTools = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };

const capturePort = (bodies: Array<ReadableStream<Uint8Array>>) => {
	const requests: HttpRequest[] = [];
	const port = {
		request: jest.fn(),
		stream: jest.fn(async (req: HttpRequest) => {
			requests.push(req);
			return { status: 200, ok: true, body: bodies[requests.length - 1], text: async () => '' };
		}),
	} as unknown as HttpPort;
	return { port, requests };
};

const toolCallsOf = (chunks: StreamChunk[]) => chunks.flatMap((chunk) => chunk.toolCalls ?? []).map((call) => `${call.function.name}(${call.function.arguments})`);

describe('OpenAI-compatible providers', () => {
	it('keeps tool calls of two concurrent streams on one instance apart', async () => {
		const first = controllableStream();
		const second = controllableStream();
		const { port } = capturePort([first.body, second.body]);
		const provider = new OpenAIProvider({ provider: 'openai', apiKey: 'k' }, port);
		const chunksA: StreamChunk[] = [];
		const chunksB: StreamChunk[] = [];

		const runA = provider.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunksA.push(c));
		const runB = provider.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunksB.push(c));
		await new Promise((resolve) => setTimeout(resolve, 0));
		first.send([toolDelta(0, { id: 'a', name: 'read', args: '{"p":' })]);
		second.send([toolDelta(0, { id: 'b', name: 'write', args: '{"q":' })]);
		first.send([toolDelta(0, { args: '1}' }), finishTools, '[DONE]']);
		second.send([toolDelta(0, { args: '2}' }), finishTools, '[DONE]']);
		first.close();
		second.close();
		await Promise.all([runA, runB]);

		expect(toolCallsOf(chunksA)).toEqual(['read({"p":1})']);
		expect(toolCallsOf(chunksB)).toEqual(['write({"q":2})']);
	});

	it('streams DeepSeek reasoning separately from the answer', async () => {
		const stream = controllableStream();
		const { port } = capturePort([stream.body]);
		const chunks: StreamChunk[] = [];

		const run = new DeepSeekProvider({ provider: 'deepseek', apiKey: 'k' }, port).streamChat({ model: 'deepseek-reasoner', messages: [] }, (c) => chunks.push(c));
		await new Promise((resolve) => setTimeout(resolve, 0));
		stream.send([{ choices: [{ delta: { reasoning_content: 'thinking' } }] }, { choices: [{ delta: { content: 'answer' } }] }, '[DONE]']);
		stream.close();
		await run;

		expect(chunks.filter((c) => c.reasoning).map((c) => c.reasoning)).toEqual(['thinking']);
		expect(chunks.filter((c) => c.content).map((c) => c.content)).toEqual(['answer']);
	});

	it('shapes each vendor request correctly', async () => {
		const bodies = [controllableStream(), controllableStream()];
		bodies.forEach((b) => b.close());
		const { port, requests } = capturePort(bodies.map((b) => b.body));

		await new OpenAIProvider({ provider: 'openai', apiKey: 'k' }, port).streamChat({ model: 'gpt-4o', messages: [], maxTokens: 50 }, () => undefined);
		await new OpenRouterProvider({ provider: 'openrouter', apiKey: 'k' }, port).streamChat({ model: 'openrouter:meta/llama', messages: [], maxTokens: 50 }, () => undefined);

		const openai = JSON.parse(requests[0].body ?? '{}') as Record<string, unknown>;
		const openrouter = JSON.parse(requests[1].body ?? '{}') as Record<string, unknown>;
		expect(requests[0].url).toBe('https://api.openai.com/v1/chat/completions');
		expect(openai.max_completion_tokens).toBe(50);
		expect(openai.stream_options).toEqual({ include_usage: true });
		expect(requests[1].url).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(requests[1].headers?.['X-Title']).toBe('Obsidian Intelligence Assistant');
		expect(openrouter.model).toBe('meta/llama');
		expect(openrouter.max_tokens).toBe(50);
		expect(openrouter.stream_options).toBeUndefined();
	});
});
