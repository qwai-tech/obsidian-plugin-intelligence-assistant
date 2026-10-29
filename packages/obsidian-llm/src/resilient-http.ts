import { StreamTransportUnavailableError, type HttpPort, type HttpRequest, type HttpResponse, type StreamResponse } from './http';

export interface ResilienceOptions {
	timeoutMs?: number;
	retries?: number;
	retryStatuses?: number[];
	backoffMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = {
	timeoutMs: 300_000,
	retries: 2,
	retryStatuses: [429, 502, 503, 504],
	backoffMs: 500,
	sleep: (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
};

export class HttpAbortedError extends Error {
	override readonly name = 'HttpAbortedError';

	constructor(url: string) {
		super(`Request to ${url} was aborted`);
	}
}

export class HttpTimeoutError extends Error {
	override readonly name = 'HttpTimeoutError';

	constructor(url: string, timeoutMs: number) {
		super(`Request to ${url} timed out after ${timeoutMs} ms`);
	}
}

export function withResilience(port: HttpPort, options: ResilienceOptions = {}): HttpPort {
	const settings = { ...DEFAULTS, ...options };

	const attempt = (req: HttpRequest): Promise<HttpResponse> => {
		const timeoutMs = req.timeoutMs ?? settings.timeoutMs;
		return new Promise<HttpResponse>((resolve, reject) => {
			const timer = window.setTimeout(() => finish(() => reject(new HttpTimeoutError(req.url, timeoutMs))), timeoutMs);
			const onAbort = () => finish(() => reject(new HttpAbortedError(req.url)));
			const finish = (settle: () => void) => {
				window.clearTimeout(timer);
				req.signal?.removeEventListener('abort', onAbort);
				settle();
			};
			req.signal?.addEventListener('abort', onAbort, { once: true });
			port.request(req).then(
				(response) => finish(() => resolve(response)),
				(error: unknown) => finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
			);
		});
	};

	return {
		async request(req: HttpRequest): Promise<HttpResponse> {
			for (let tryIndex = 0; ; tryIndex++) {
				if (req.signal?.aborted) {
					throw new HttpAbortedError(req.url);
				}
				const isLast = tryIndex >= settings.retries;
				try {
					const response = await attempt(req);
					if (isLast || !settings.retryStatuses.includes(response.status)) {
						return response;
					}
				} catch (error) {
					if (isLast || !(error instanceof StreamTransportUnavailableError)) {
						throw error;
					}
				}
				await settings.sleep(settings.backoffMs * 2 ** tryIndex);
			}
		},

		async stream(req: HttpRequest): Promise<StreamResponse> {
			if (req.signal?.aborted) {
				throw new HttpAbortedError(req.url);
			}
			return await port.stream(req);
		},
	};
}
