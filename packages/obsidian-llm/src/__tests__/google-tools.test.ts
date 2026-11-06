import { GoogleProvider } from '../providers/google-provider';
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

const searchTool = {
	type: 'function' as const,
	function: {
		name: 'search_notes',
		description: 'Search notes',
		parameters: { $schema: 'x', type: 'object', additionalProperties: false, properties: { query: { type: 'string' } } },
	},
};

const run = async (request: Partial<ChatRequest>, events: unknown[] = []) => {
	const { port, requests } = portStreaming([...events, { candidates: [{ finishReason: 'STOP' }] }]);
	const chunks: StreamChunk[] = [];
	await new GoogleProvider({ provider: 'google', apiKey: 'k' }, port).streamChat({ model: 'gemini-x', messages: [], ...request } as ChatRequest, (c) => chunks.push(c));
	return { body: JSON.parse(requests[0].body ?? '{}') as Record<string, unknown>, chunks };
};

describe('Gemini tool calling', () => {
	it('declares tools without schema keys Gemini rejects, and maps tool choice', async () => {
		const { body } = await run({ tools: [searchTool], toolChoice: { type: 'function', function: { name: 'search_notes' } } });

		expect(body.tools).toEqual([{ functionDeclarations: [{ name: 'search_notes', description: 'Search notes', parameters: { type: 'object', properties: { query: { type: 'string' } } } }] }]);
		expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['search_notes'] } });
	});

	it('sends system messages as the system instruction', async () => {
		const { body } = await run({ messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }] });

		expect(body.systemInstruction).toEqual({ parts: [{ text: 'be brief' }] });
		expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
	});

	it('replays tool calls and results as functionCall and functionResponse parts', async () => {
		const messages = [
			{ role: 'user', content: 'find pricing' },
			{ role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_notes', arguments: '{"query":"pricing"}' } }] },
			{ role: 'tool', tool_call_id: 'call_1', content: 'Pricing.md' },
		] as unknown as LLMMessage[];

		const { body } = await run({ messages, tools: [searchTool] });

		expect(body.contents).toEqual([
			{ role: 'user', parts: [{ text: 'find pricing' }] },
			{ role: 'model', parts: [{ functionCall: { name: 'search_notes', args: { query: 'pricing' } } }] },
			{ role: 'user', parts: [{ functionResponse: { name: 'search_notes', response: { content: 'Pricing.md' } } }] },
		]);
	});

	it('streams functionCall parts back as tool calls and joins text parts', async () => {
		const { chunks } = await run({ tools: [searchTool] }, [
			{ candidates: [{ content: { parts: [{ text: 'Looking ' }, { text: 'now.' }] } }] },
			{ candidates: [{ content: { parts: [{ functionCall: { name: 'search_notes', args: { query: 'pricing' } } }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } },
		]);

		expect(chunks.filter((c) => c.content).map((c) => c.content)).toEqual(['Looking now.']);
		const calls = chunks.flatMap((c) => c.toolCalls ?? []);
		expect(calls).toHaveLength(1);
		expect(calls[0].function).toEqual({ name: 'search_notes', arguments: '{"query":"pricing"}' });
		expect(calls[0].id).toMatch(/\S/);
	});
});
