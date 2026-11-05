import { runtimeClock } from './runtime-clock';
import { StreamTransportUnavailableError, type HttpPort, type HttpRequest, type HttpResponse, type StreamResponse } from './http';

export interface ResilienceOptions {
	timeoutMs?: number;
	streamIdleTimeoutMs?: number;
	streamMaxDurationMs?: number;
	retries?: number;
	retryStatuses?: number[];
	backoffMs?: number;
	sleep?: (ms: number) => Promise<void>;
}
const DEFAULTS = { timeoutMs: 300_000, streamMaxDurationMs: 900_000, retries: 2, retryStatuses: [429, 502, 503, 504], backoffMs: 500,
	sleep: (ms: number) => new Promise<void>(resolve => runtimeClock.schedule(resolve, ms)) };

export class HttpAbortedError extends Error {
	override readonly name = 'HttpAbortedError';
	constructor(_url?: string) { super('Request was aborted'); }
}
export class HttpTimeoutError extends Error {
	override readonly name = 'HttpTimeoutError';
	constructor(_url: string, readonly timeoutMs: number, readonly details?: { phase: 'response_headers' | 'stream_idle' | 'stream_total'; elapsedMs: number; receivedBytes: number }) {
		super(`Request timed out after ${timeoutMs} ms${details ? ` (${details.phase}; ${details.elapsedMs} ms elapsed; ${details.receivedBytes} bytes received). The response is incomplete; generation was not retried.` : ''}`);
	}
}

/** A retry grant describes the operation, not the HTTP status that happened to arrive. */
export function mayRetryRequest(request: HttpRequest): boolean {
	if (request.retry) return request.retry === 'safe';
	return ['GET', 'HEAD', 'OPTIONS'].includes((request.method ?? 'POST').toUpperCase());
}

function deadline(request: HttpRequest, timeoutMs: number, failure = () => new HttpTimeoutError(request.url, timeoutMs)) {
	const controller = new AbortController();
	const abort = () => controller.abort(new HttpAbortedError());
	if (request.signal?.aborted) abort();
	else request.signal?.addEventListener('abort', abort, { once: true });
	const timer = runtimeClock.schedule(() => controller.abort(failure()), timeoutMs);
	return { signal: controller.signal, abort: (reason: Error) => controller.abort(reason), cleanup: () => { runtimeClock.cancel(timer); request.signal?.removeEventListener('abort', abort); } };
}
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('Operation aborted'));
		if (signal.aborted) { reject(signal.reason instanceof Error ? signal.reason : new Error('Operation aborted')); return; }
		signal.addEventListener('abort', abort, { once: true });
		work.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error instanceof Error ? error : new Error(String(error))); });
	});
}

export function withResilience(port: HttpPort, options: ResilienceOptions = {}): HttpPort {
	const settings = { ...DEFAULTS, ...options };
	return {
		async request(req): Promise<HttpResponse> {
			const scope = deadline(req, req.timeoutMs ?? settings.timeoutMs);
			try {
				for (let attempt = 0; ; attempt++) {
					scope.signal.throwIfAborted();
					const last = !mayRetryRequest(req) || attempt >= settings.retries;
					try {
						const response = await abortable(port.request({ ...req, signal: scope.signal }), scope.signal);
						if (last || !settings.retryStatuses.includes(response.status)) return response;
					} catch (error) {
						if (scope.signal.aborted) throw scope.signal.reason;
						if (last || !(error instanceof StreamTransportUnavailableError)) throw error;
					}
					await abortable(settings.sleep(settings.backoffMs * 2 ** attempt), scope.signal);
				}
			} finally { scope.cleanup(); }
		},
		async stream(req): Promise<StreamResponse> {
			const startedAt = Date.now();
			let receivedBytes = 0;
			// Explicit old-style deadlines keep their absolute meaning. Ordinary
			// streams get a bounded total lifetime plus a resetting inactivity limit.
			const totalMs = req.timeoutMs ?? options.timeoutMs ?? settings.streamMaxDurationMs;
			const idleMs = req.streamIdleTimeoutMs ?? settings.streamIdleTimeoutMs ?? settings.timeoutMs;
			const failure = (ms: number, phase: NonNullable<HttpTimeoutError['details']>['phase']) => new HttpTimeoutError(req.url, ms, { phase, elapsedMs: Date.now() - startedAt, receivedBytes });
			const scope = deadline(req, totalMs, () => failure(totalMs, 'stream_total'));
			let idleTimer: ReturnType<typeof runtimeClock.schedule> | undefined;
			const armIdle = (ms: number, phase: 'response_headers' | 'stream_idle') => {
				if (idleTimer !== undefined) runtimeClock.cancel(idleTimer);
				idleTimer = runtimeClock.schedule(() => scope.abort(failure(ms, phase)), ms);
			};
			const cleanup = () => { if (idleTimer !== undefined) runtimeClock.cancel(idleTimer); scope.cleanup(); };
			armIdle(settings.timeoutMs, 'response_headers');
			try {
				scope.signal.throwIfAborted();
				const response = await abortable(port.stream({ ...req, signal: scope.signal }), scope.signal);
				if (!response.body || !response.ok) { cleanup(); return response; }
				scope.signal.throwIfAborted();
				const reader = response.body.getReader();
				armIdle(idleMs, 'stream_idle');
				let ended = false;
				let abort: () => void;
				const finish = () => { ended = true; cleanup(); scope.signal.removeEventListener('abort', abort); };
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						abort = () => { if (ended) return; finish(); void reader.cancel().catch(() => undefined); controller.error(scope.signal.reason); };
						scope.signal.addEventListener('abort', abort, { once: true });
						if (scope.signal.aborted) abort();
					},
					async pull(controller) {
						try {
							const result = await reader.read();
							if (ended) return;
							if (result.done) { finish(); controller.close(); } else {
								if (result.value.byteLength) { receivedBytes += result.value.byteLength; armIdle(idleMs, 'stream_idle'); }
								controller.enqueue(result.value);
							}
						} catch (error) { if (!ended) { finish(); controller.error(error); } }
					},
					async cancel() { if (!ended) finish(); await reader.cancel(); },
				});
				return { ...response, body };
			} catch (error) { cleanup(); throw scope.signal.aborted ? scope.signal.reason : error; }
		},
	};
}
