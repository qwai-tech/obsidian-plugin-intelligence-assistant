import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export const DEFAULT_MOCK_LLM_PORT = 43117;
export const MOCK_LLM_BASE_URL = `http://127.0.0.1:${DEFAULT_MOCK_LLM_PORT}`;
export const MOCK_LLM_OPENAI_BASE_URL = `${MOCK_LLM_BASE_URL}/v1`;

export interface QueuedLLMResponse {
	statusCode: number;
	body: unknown;
	headers?: Record<string, string>;
	streamChunks?: string[];
	streamChunkDelayMs?: number;
}

export interface CapturedLLMCall {
	method: string;
	path: string;
	headers: Record<string, string | string[] | undefined>;
	body: unknown;
	timestamp: number;
}

export interface MockLLMServer {
	start(): Promise<void>;
	stop(): Promise<void>;
	reset(): void;
	queue(response: QueuedLLMResponse): void;
	getCalls(): CapturedLLMCall[];
}

export function createMockLLMServer(options: { port?: number } = {}): MockLLMServer {
	const port = options.port ?? DEFAULT_MOCK_LLM_PORT;
	const queue: QueuedLLMResponse[] = [];
	const calls: CapturedLLMCall[] = [];
	let server: Server | null = null;

	function reset(): void {
		queue.length = 0;
		calls.length = 0;
	}

	function queueResponse(response: QueuedLLMResponse): void {
		queue.push(response);
	}

	function getCalls(): CapturedLLMCall[] {
		return calls.map((call) => ({
			...call,
			headers: { ...call.headers },
			body: cloneJson(call.body),
		}));
	}

	async function start(): Promise<void> {
		if (server) return;
		server = createServer((req, res) => {
			void handleRequest(req, res).catch((error) => {
				if (!res.headersSent) {
					writeJson(res, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
					return;
				}
				res.destroy(error instanceof Error ? error : new Error(String(error)));
			});
		});
		await new Promise<void>((resolve, reject) => {
			server!.once('error', reject);
			server!.listen(port, '127.0.0.1', () => {
				server!.off('error', reject);
				resolve();
			});
		});
	}

	async function stop(): Promise<void> {
		if (!server) return;
		const current = server;
		server = null;
		await new Promise<void>((resolve, reject) => {
			current.close((error) => error ? reject(error) : resolve());
		});
	}

	async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const requestPath = req.url ?? '/';
		if (req.method === 'OPTIONS') {
			writeNoContent(res);
			return;
		}
		if (requestPath === '/__mock__/reset' && req.method === 'POST') {
			reset();
			writeJson(res, 200, { ok: true });
			return;
		}
		if (requestPath === '/__mock__/queue' && req.method === 'POST') {
			queueResponse(await readJsonBody<QueuedLLMResponse>(req));
			writeJson(res, 200, { ok: true });
			return;
		}
		if (requestPath === '/__mock__/calls' && req.method === 'GET') {
			writeJson(res, 200, getCalls());
			return;
		}
		if (requestPath === '/__mock__/health' && req.method === 'GET') {
			writeJson(res, 200, { ok: true });
			return;
		}
		if (requestPath === '/v1/models' && req.method === 'GET') {
			calls.push({
				method: req.method,
				path: requestPath,
				headers: { ...req.headers },
				body: null,
				timestamp: Date.now(),
			});
			const next = queue.shift() ?? defaultModelsResponse();
			await writeQueuedResponse(res, next);
			return;
		}
		if (requestPath === '/v1/chat/completions' && req.method === 'POST') {
			const body = await readJsonBody<unknown>(req);
			calls.push({
				method: req.method,
				path: requestPath,
				headers: { ...req.headers },
				body,
				timestamp: Date.now(),
			});
			const next = queue.shift() ?? defaultResponse();
			await writeQueuedResponse(res, next, body);
			return;
		}
		writeJson(res, 404, { error: { message: `No mock route for ${req.method ?? 'GET'} ${requestPath}` } });
	}

	return { start, stop, reset, queue: queueResponse, getCalls };
}

async function readRawBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let raw = '';
		req.setEncoding('utf8');
		req.on('data', (chunk) => { raw += chunk; });
		req.on('end', () => resolve(raw));
		req.on('error', reject);
	});
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
	const raw = await readRawBody(req);
	return raw ? JSON.parse(raw) as T : undefined as T;
}

async function writeQueuedResponse(res: ServerResponse, response: QueuedLLMResponse, requestBody?: unknown): Promise<void> {
	const streamChunks = response.streamChunks ?? streamChunksFromQueuedResponse(response, requestBody);
	if (streamChunks) {
		await writeEventStream(res, response.statusCode, streamChunks, response.headers, response.streamChunkDelayMs);
		return;
	}

	writeJson(res, response.statusCode, response.body, response.headers);
}

function writeEventStream(
	res: ServerResponse,
	statusCode: number,
	streamChunks: string[],
	headers: Record<string, string> = {},
	streamChunkDelayMs = 0
): Promise<void> {
	res.writeHead(statusCode, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		...corsHeaders(),
		...headers,
	});
	return writeStreamChunks(res, streamChunks, Math.max(0, streamChunkDelayMs));
}

async function writeStreamChunks(res: ServerResponse, streamChunks: string[], delayMs: number): Promise<void> {
	for (let index = 0; index < streamChunks.length; index++) {
		const chunk = streamChunks[index];
		res.write(`data: ${chunk}\n\n`);
		if (delayMs > 0 && index < streamChunks.length - 1) {
			await sleep(delayMs);
		}
	}
	res.write('data: [DONE]\n\n');
	res.end();
}

function streamChunksFromQueuedResponse(response: QueuedLLMResponse, requestBody?: unknown): string[] | null {
	if (!isSuccessful(response.statusCode) || !isStreamingRequest(requestBody)) {
		return null;
	}
	return openAIStreamChunksFromChatCompletion(response.body);
}

function openAIStreamChunksFromChatCompletion(body: unknown): string[] | null {
	if (!isRecord(body)) return null;
	const choices = Array.isArray(body.choices) ? body.choices : [];
	const choice = choices[0];
	if (!isRecord(choice)) return null;
	const message = isRecord(choice.message) ? choice.message : null;
	if (!message) return null;

	const now = Math.floor(Date.now() / 1000);
	const base = {
		id: typeof body.id === 'string' ? body.id : 'cmpl_mock',
		object: 'chat.completion.chunk',
		created: typeof body.created === 'number' ? body.created : now,
		model: typeof body.model === 'string' ? body.model : 'gpt-4o-mini',
	};
	const index = typeof choice.index === 'number' ? choice.index : 0;
	const chunks: string[] = [];
	const content = typeof message.content === 'string' ? message.content : '';
	const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : null;

	if (content) {
		chunks.push(JSON.stringify({
			...base,
			choices: [{ index, delta: { content }, finish_reason: null }],
		}));
	}
	if (toolCalls) {
		chunks.push(JSON.stringify({
			...base,
			choices: [{ index, delta: { tool_calls: toolCalls }, finish_reason: null }],
		}));
		chunks.push(JSON.stringify({
			...base,
			choices: [{ index, delta: {}, finish_reason: 'tool_calls' }],
		}));
	} else {
		chunks.push(JSON.stringify({
			...base,
			choices: [{ index, delta: {}, finish_reason: typeof choice.finish_reason === 'string' ? choice.finish_reason : 'stop' }],
		}));
	}
	if (isRecord(body.usage)) {
		chunks.push(JSON.stringify({
			...base,
			choices: [],
			usage: body.usage,
		}));
	}

	return chunks;
}

function isSuccessful(statusCode: number): boolean {
	return statusCode >= 200 && statusCode < 300;
}

function isStreamingRequest(body: unknown): boolean {
	return isRecord(body) && body.stream === true;
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown, headers: Record<string, string> = {}): void {
	res.writeHead(statusCode, { 'content-type': 'application/json', ...corsHeaders(), ...headers });
	res.end(JSON.stringify(body));
}

function writeNoContent(res: ServerResponse): void {
	res.writeHead(204, corsHeaders());
	res.end();
}

function corsHeaders(): Record<string, string> {
	return {
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET, POST, OPTIONS',
		'access-control-allow-headers': 'authorization, content-type',
		'access-control-allow-private-network': 'true',
	};
}

function defaultResponse(): QueuedLLMResponse {
	return {
		statusCode: 200,
		body: {
			id: 'cmpl_default_mock',
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: 'gpt-4o-mini',
			choices: [{
				index: 0,
				message: { role: 'assistant', content: 'Default mock response' },
				finish_reason: 'stop',
			}],
			usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 },
		},
	};
}

function defaultModelsResponse(): QueuedLLMResponse {
	return {
		statusCode: 200,
		body: {
			object: 'list',
			data: [
				{ id: 'gpt-4o-mini', object: 'model' },
				{ id: 'gpt-4o', object: 'model' },
			],
		},
	};
}

function cloneJson<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
