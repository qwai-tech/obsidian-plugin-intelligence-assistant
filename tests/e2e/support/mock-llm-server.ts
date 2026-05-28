import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export const DEFAULT_MOCK_LLM_PORT = 43117;
export const MOCK_LLM_BASE_URL = `http://127.0.0.1:${DEFAULT_MOCK_LLM_PORT}`;
export const MOCK_LLM_OPENAI_BASE_URL = `${MOCK_LLM_BASE_URL}/v1`;

export interface QueuedLLMResponse {
	statusCode: number;
	body: unknown;
	headers?: Record<string, string>;
	streamChunks?: string[];
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
			void handleRequest(req, res);
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
			writeQueuedResponse(res, next);
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

function writeQueuedResponse(res: ServerResponse, response: QueuedLLMResponse): void {
	if (response.streamChunks) {
		res.writeHead(response.statusCode, {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			...(response.headers ?? {}),
		});
		for (const chunk of response.streamChunks) {
			res.write(`data: ${chunk}\n\n`);
		}
		res.write('data: [DONE]\n\n');
		res.end();
		return;
	}

	writeJson(res, response.statusCode, response.body, response.headers);
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown, headers: Record<string, string> = {}): void {
	res.writeHead(statusCode, { 'content-type': 'application/json', ...headers });
	res.end(JSON.stringify(body));
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

function cloneJson<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
