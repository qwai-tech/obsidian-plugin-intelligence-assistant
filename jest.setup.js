/**
 * Jest setup file
 * Provides polyfills and global mocks for testing
 */

// Add TextEncoder and TextDecoder polyfills for jsdom
const { TextEncoder, TextDecoder } = require('util');
const { ReadableStream, TransformStream, WritableStream } = require('stream/web');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.ReadableStream = global.ReadableStream || ReadableStream;
global.TransformStream = global.TransformStream || TransformStream;
global.WritableStream = global.WritableStream || WritableStream;
global.structuredClone = global.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));

// Obsidian exposes `activeWindow`/`activeDocument` globals (popout-safe). In jsdom
// these resolve to the standard `window`/`document`.
if (typeof document !== 'undefined') {
	global.activeDocument = global.activeDocument || global.document;
}
if (typeof window !== 'undefined') {
	global.activeWindow = global.activeWindow || global.window;
}

// jsdom does not expose a `fetch` implementation. The LLM providers' streaming
// path (BaseStreamingProvider.streamChat) calls global `fetch` directly (NOT
// Obsidian's `requestUrl`), so the headless agent harness needs a real `fetch`
// to reach the in-process mock LLM server over HTTP. Bridging undici into jsdom
// fails because undici fights jsdom's timer shims (`this.timeout.unref is not a
// function`). Instead we provide a minimal real-HTTP `fetch` over Node's `http`
// module, exposing exactly the surface the provider consumes: `.ok`, `.status`,
// `.text()`, and a streamed `.body` that is a real web ReadableStream<Uint8Array>
// (the SSE chunks the provider's reader pulls from). Scoped to the headless test
// scenario only; production runtime (Electron) provides its own global `fetch`.
if (typeof global.fetch === 'undefined') {
	const http = require('http');
	const { URL } = require('url');

	global.fetch = (input, init = {}) =>
		new Promise((resolve, reject) => {
			const url = new URL(typeof input === 'string' ? input : String(input));
			// This shim does a real Node HTTP round-trip. Restrict it to loopback so a
			// future test that passes a non-local host fails LOUDLY here instead of
			// silently making a real network request (silent flake/hang). Live provider
			// traffic must supply its own real `fetch` (see agent-e2e-live.test.ts).
			const host = url.hostname;
			if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
				throw new Error(`Blocked non-loopback fetch in tests: ${url.host}. The jest fetch shim only round-trips to the local mock server.`);
			}
			const req = http.request(
				{
					protocol: url.protocol,
					hostname: url.hostname,
					port: url.port,
					path: `${url.pathname}${url.search}`,
					method: init.method || 'GET',
					headers: init.headers || {},
				},
				(res) => {
					const status = res.statusCode || 0;
					const body = new global.ReadableStream({
						start(controller) {
							res.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)));
							res.on('end', () => controller.close());
							res.on('error', (err) => controller.error(err));
						},
						cancel() {
							res.destroy();
						},
					});
					// NOTE: `.body` and `.text()` consume the SAME underlying stream, so
					// they are mutually exclusive — never read both or the second read
					// hits a locked/exhausted stream. The provider reads `.text()` only
					// on the error path and `.body` only on success, so this is safe.
					resolve({
						ok: status >= 200 && status < 300,
						status,
						headers: res.headers,
						body,
						async text() {
							const reader = body.getReader();
							const decoder = new global.TextDecoder();
							let out = '';
							// eslint-disable-next-line no-constant-condition
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								out += decoder.decode(value, { stream: true });
							}
							return out;
						},
						async json() {
							return JSON.parse(await this.text());
						},
					});
				},
			);
			req.on('error', reject);
			if (init.body != null) {
				req.write(init.body);
			}
			req.end();
		});
}
