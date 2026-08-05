import { requestUrl } from 'obsidian';
import {
	type HttpPort,
	type HttpRequest,
	type HttpResponse,
	type StreamResponse,
	StreamTransportUnavailableError,
} from './http';

/**
 * The adapter that makes this package work inside Obsidian.
 *
 * It splits the two transports along the only line that actually works:
 *
 * - `request()` uses `requestUrl`, which runs in Obsidian's main process and is
 *   therefore exempt from browser CORS -- but it buffers the whole response.
 * - `stream()` uses the renderer's `fetch`, the only way to get a live
 *   `ReadableStream`, and translates a CORS/network refusal into
 *   `StreamTransportUnavailableError` so callers can retry over `request()`.
 *
 * A blocked browser request surfaces as an opaque `TypeError` with no way to
 * distinguish CORS from a dropped connection; either way the remedy is the same,
 * so both map onto the same error. HTTP status errors are deliberately NOT
 * translated: `requestUrl` would hit the identical status, so a retry is waste.
 */
export function createObsidianHttpPort(): HttpPort {
	return {
		async request(req: HttpRequest): Promise<HttpResponse> {
			const res = await requestUrl({
				url: req.url,
				method: req.method ?? 'POST',
				headers: req.headers,
				body: req.body,
				// Obsidian throws on non-2xx by default; we want to inspect the
				// body of error responses ourselves to surface the provider's
				// message rather than a bare status code.
				throw: false,
			});

			const text = typeof res.text === 'string' ? res.text : JSON.stringify(res.text);
			let json: unknown;
			try {
				json = res.json;
			} catch {
				json = undefined;
			}

			return {
				status: res.status,
				ok: res.status >= 200 && res.status < 300,
				text,
				json,
				headers: res.headers ?? {},
			};
		},

		async stream(req: HttpRequest): Promise<StreamResponse> {
			let res: Response;
			try {
				res = await fetch(req.url, {
					method: req.method ?? 'POST',
					headers: req.headers,
					body: req.body,
				});
			} catch (error: unknown) {
				if (error instanceof TypeError) {
					throw new StreamTransportUnavailableError(
						`Streaming transport blocked for ${req.url} (likely missing CORS headers)`,
						error,
					);
				}
				throw error;
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
