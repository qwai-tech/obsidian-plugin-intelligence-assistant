/**
 * The single seam between this package and its host environment.
 *
 * Providers need two different transports, and the difference is not cosmetic:
 *
 * - Buffered requests must bypass browser CORS. Many OpenAI-compatible gateways
 *   (local hubs especially) send no CORS headers, so a renderer-side `fetch`
 *   never reaches them.
 * - Token-by-token streaming needs a live `ReadableStream`, which a buffering
 *   transport by definition cannot give.
 *
 * No single transport does both, so the port exposes both and lets the adapter
 * decide how to satisfy them. Keeping this in one interface is what allows the
 * providers to contain no environment-specific code at all.
 */

export interface HttpRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
	timeoutMs?: number;
	/** Streaming inactivity after headers. timeoutMs, when supplied, remains an absolute cap. */
	streamIdleTimeoutMs?: number;
	/** Only explicitly safe operations may retry. Writes default to never. */
	retry?: 'safe' | 'never';
}

export interface HttpResponse {
	status: number;
	ok: boolean;
	text: string;
	json: unknown;
	headers: Record<string, string>;
}

export interface StreamResponse {
	status: number;
	ok: boolean;
	body: ReadableStream<Uint8Array> | null;
	text(): Promise<string>;
}

/**
 * Raised when the transport could not reach the endpoint at all -- CORS refusal,
 * DNS failure, connection reset. Distinct from "the server answered with an HTTP
 * error", because only the former is worth retrying over a different transport.
 *
 * Detecting this is inherently environment-specific (a browser reports a CORS
 * block as an opaque `TypeError`), so each adapter is responsible for the
 * translation and callers get to stay generic.
 */
export class StreamTransportUnavailableError extends Error {
	override readonly name = 'StreamTransportUnavailableError';

	constructor(message: string, readonly cause?: unknown) {
		super(message);
	}
}

export interface HttpPort {
	/** Buffered request. Must bypass browser CORS where the host allows it. */
	request(req: HttpRequest): Promise<HttpResponse>;

	/**
	 * Streaming request. Rejects with {@link StreamTransportUnavailableError}
	 * when the transport itself is blocked, so the caller can fall back to
	 * {@link HttpPort.request}. HTTP-level errors resolve normally with `ok:false`.
	 */
	stream(req: HttpRequest): Promise<StreamResponse>;
}

let defaultPort: HttpPort | null = null;

/**
 * Install the transport the whole package should use when a caller doesn't pass
 * one explicitly. A host sets this once during startup.
 *
 * The alternative -- threading a port parameter through every call site -- would
 * push a transport concern into ~30 places, including presentation code that has
 * no business knowing how HTTP happens. One explicit registration keeps the
 * providers injectable (tests pass a port directly) without that spread.
 */
export function setDefaultHttpPort(port: HttpPort): void {
	defaultPort = port;
}

/** The registered default transport. */
export function getDefaultHttpPort(): HttpPort {
	if (!defaultPort) {
		throw new Error(
			'No HTTP transport registered. Call setDefaultHttpPort(createObsidianHttpPort()) ' +
			'during plugin startup, or pass a port explicitly.',
		);
	}
	return defaultPort;
}

/** Test seam: forget the registered transport. */
export function resetDefaultHttpPort(): void {
	defaultPort = null;
}

/**
 * Plain `fetch` adapter -- correct anywhere `fetch` can actually reach the
 * endpoint (Node, tests, same-origin or CORS-enabled gateways). It cannot
 * bypass CORS, so in a browser-like host prefer the Obsidian adapter.
 */
export function createFetchHttpPort(fetchImpl: typeof fetch = fetch): HttpPort {
	const toStreamError = (error: unknown) =>
		new StreamTransportUnavailableError(
			error instanceof Error ? error.message : String(error),
			error,
		);

	return {
		async request(req) {
			let res: Response;
			try {
				res = await fetchImpl(req.url, {
					method: req.method ?? 'POST',
					headers: req.headers,
					body: req.body,
					signal: req.signal,
				});
			} catch (error: unknown) {
				throw toStreamError(error);
			}
			const text = await res.text();
			let json: unknown;
			try {
				json = text ? JSON.parse(text) : undefined;
			} catch {
				json = undefined;
			}
			const headers: Record<string, string> = {};
			res.headers.forEach((value, key) => { headers[key] = value; });
			return { status: res.status, ok: res.ok, text, json, headers };
		},

		async stream(req) {
			let res: Response;
			try {
				res = await fetchImpl(req.url, {
					method: req.method ?? 'POST',
					headers: req.headers,
					body: req.body,
					signal: req.signal,
				});
			} catch (error: unknown) {
				// A blocked request throws before any response is available.
				throw toStreamError(error);
			}
			return {
				status: res.status,
				ok: res.ok,
				body: res.body,
				text: () => res.text(),
			};
		},
	};
}
