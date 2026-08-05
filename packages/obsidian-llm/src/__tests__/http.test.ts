import {
	StreamTransportUnavailableError,
	createFetchHttpPort,
	getDefaultHttpPort,
	resetDefaultHttpPort,
	setDefaultHttpPort,
} from '../http';
import { reportDiagnostic, resetDiagnosticsSink, setDiagnosticsSink } from '../diagnostics';

// jsdom provides no global `Response`, so stub the slice the port actually reads.
function fakeResponse(body: string, status = 200) {
	return {
		status,
		ok: status >= 200 && status < 300,
		body: null,
		text: async () => body,
		headers: { forEach: (_fn: (v: string, k: string) => void) => undefined },
	};
}

describe('default HTTP port registry', () => {
	afterEach(() => { resetDefaultHttpPort(); });

	// The message is the only thing a host developer sees when they forget to wire
	// the package up, so it has to name the fix.
	it('fails with an actionable message when nothing is registered', () => {
		expect(() => getDefaultHttpPort()).toThrow(/setDefaultHttpPort/);
	});

	it('returns the registered port', () => {
		const port = createFetchHttpPort(jest.fn());
		setDefaultHttpPort(port);
		expect(getDefaultHttpPort()).toBe(port);
	});
});

describe('createFetchHttpPort', () => {
	it('exposes status, text and parsed json for a buffered request', async () => {
		const fetchImpl = jest.fn(async () => fakeResponse('{"a":1}'));
		const port = createFetchHttpPort(fetchImpl as unknown as typeof fetch);

		const res = await port.request({ url: 'https://x.test', body: '{}' });

		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);
		expect(res.text).toBe('{"a":1}');
		expect(res.json).toEqual({ a: 1 });
	});

	it('leaves json undefined when the body is not JSON, rather than throwing', async () => {
		const fetchImpl = jest.fn(async () => fakeResponse('not json'));
		const port = createFetchHttpPort(fetchImpl as unknown as typeof fetch);

		const res = await port.request({ url: 'https://x.test' });

		expect(res.text).toBe('not json');
		expect(res.json).toBeUndefined();
	});

	// An HTTP error is a real answer from the server; retrying it over a different
	// transport would hit the same status, so it must NOT look like a transport
	// failure to the caller.
	it('reports an HTTP error as ok:false, not as a transport failure', async () => {
		const fetchImpl = jest.fn(async () => fakeResponse('nope', 401));
		const port = createFetchHttpPort(fetchImpl as unknown as typeof fetch);

		const res = await port.stream({ url: 'https://x.test' });

		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});

	it('translates a blocked request into StreamTransportUnavailableError', async () => {
		const fetchImpl = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
		const port = createFetchHttpPort(fetchImpl as unknown as typeof fetch);

		await expect(port.stream({ url: 'https://x.test' }))
			.rejects.toBeInstanceOf(StreamTransportUnavailableError);
	});
});

describe('diagnostics', () => {
	afterEach(() => { resetDiagnosticsSink(); });

	it('routes reports to the registered sink', () => {
		const sink = jest.fn();
		setDiagnosticsSink(sink);

		reportDiagnostic({ level: 'warn', message: 'model list unavailable' });

		expect(sink).toHaveBeenCalledWith({ level: 'warn', message: 'model list unavailable' });
	});

	// A host whose sink throws (a Notice constructed at a bad moment, say) must not
	// take down the model fetch that was only trying to warn.
	it('swallows a throwing sink', () => {
		setDiagnosticsSink(() => { throw new Error('sink exploded'); });
		const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

		expect(() => reportDiagnostic({ level: 'warn', message: 'still fine' })).not.toThrow();

		spy.mockRestore();
	});
});
