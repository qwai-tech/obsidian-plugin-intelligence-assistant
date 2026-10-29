import { BaseStreamingProvider, type ChunkParser } from '../base-streaming-provider';
import type { ChatRequest, ChatResponse, StreamChunk } from '../types';
import type { HttpPort, HttpRequest } from '../http';

class EchoProvider extends BaseStreamingProvider {
	get name(): string {
		return 'echo';
	}

	protected getProviderName(): string {
		return 'echo';
	}

	protected createChunkParser(): ChunkParser {
		return (data) => ({ content: (data as { text: string }).text, done: false });
	}

	protected prepareStreamRequest(request: ChatRequest): { url: string; body: unknown } {
		return { url: 'https://llm.test/stream', body: { model: request.model } };
	}

	chat(): Promise<ChatResponse> {
		return Promise.resolve({ content: '' });
	}
}

const sse = (...texts: string[]) => texts.map((text) => `data: ${JSON.stringify({ text })}\n`).join('');

const streamingPort = (pullChunks: () => ReadableStream<Uint8Array>) => {
	const requests: HttpRequest[] = [];
	const port = {
		request: jest.fn(),
		stream: jest.fn(async (req: HttpRequest) => {
			requests.push(req);
			return { status: 200, ok: true, body: pullChunks(), text: async () => '' };
		}),
	} as unknown as HttpPort;
	return { port, requests };
};

describe('streaming cancellation', () => {
	it('hands the request signal to the transport', async () => {
		const encoder = new TextEncoder();
		const { port, requests } = streamingPort(() => new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sse('hi')));
				controller.close();
			},
		}));
		const controller = new AbortController();

		await new EchoProvider({ provider: 'echo' } as never, port).streamChat({ model: 'm', messages: [], signal: controller.signal }, () => undefined);

		expect(requests[0].signal).toBe(controller.signal);
	});

	it('stops reading and cancels the body once the signal aborts', async () => {
		const encoder = new TextEncoder();
		const cancel = jest.fn();
		let push!: (text: string) => void;
		const { port } = streamingPort(() => new ReadableStream({
			start(controller) {
				push = (text) => controller.enqueue(encoder.encode(sse(text)));
			},
			cancel,
		}));
		const abort = new AbortController();
		const chunks: StreamChunk[] = [];

		const done = new EchoProvider({ provider: 'echo' } as never, port).streamChat({ model: 'm', messages: [], signal: abort.signal }, (chunk) => {
			chunks.push(chunk);
			if (chunk.content === 'first') abort.abort();
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		push('first');
		await done;

		expect(chunks.map((c) => c.content)).toEqual(['first', '']);
		expect(chunks[chunks.length - 1].done).toBe(true);
		expect(cancel).toHaveBeenCalled();
	});
});
