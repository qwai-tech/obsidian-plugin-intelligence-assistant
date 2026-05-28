# Bidi-Free E2E LLM Mock Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WebDriver Bidi-dependent `browser.mock` LLM interception with a local HTTP stub server that supports deterministic chat replies, streaming, tool-call scenarios, errors, request capture, and smoke-spec chat round-trip assertions.

**Architecture:** Start a small Node HTTP server from `tests/e2e/config/wdio.ci.conf.ts` before Obsidian launches. Point the seeded OpenAI provider in the E2E vault template at `http://127.0.0.1:<port>/v1`, and make `tests/e2e/support/mock-llm.ts` talk to the server's admin endpoints instead of `browser.mock`. Specs keep the same `mockLLM.replyWith(...)` style API while the plugin exercises its normal `requestUrl` network path.

**Tech Stack:** Node `http`, WebdriverIO, wdio-obsidian-service, TypeScript, Jest for helper unit tests, existing E2E fixtures and page objects.

---

## Source Requirements

From `docs/project/e2e-backlog.md`:

- Replace `browser.mock` because it requires WebDriver Bidi and breaks Obsidian launch.
- Keep the public `mockLLM` API shape: `replyWith`, `toolCall`, `errorStatus`, `clearAll`.
- Add request capture so specs can inspect `model` and `messages`.
- Restore the deferred smoke round-trip: send "ping" -> mock returns "pong" -> UI shows user and assistant messages -> conversation JSON contains both.

## File Structure

- Create: `tests/e2e/support/mock-llm-server.ts`
  - Owns the local HTTP server, queued responses, SSE streaming, request capture, and admin routes.
- Modify: `tests/e2e/support/mock-llm.ts`
  - Becomes a thin client for admin routes. No `browser.mock`.
- Modify: `tests/e2e/config/wdio.ci.conf.ts`
  - Starts and stops the mock server around CI E2E runs.
- Modify: `tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user/settings.json`
  - Points the seeded OpenAI provider at the local mock server base URL.
- Modify: `tests/e2e/specs/00-smoke.spec.ts`
  - Adds the deferred chat round-trip assertion.
- Modify: `tests/e2e/README.md`
  - Removes the Bidi limitation note and documents the HTTP mock.
- Modify: `docs/project/e2e-backlog.md`
  - Marks the Bidi-free mock and smoke round-trip items done after implementation commits exist.
- Test: `src/__tests__/e2e-mock-llm-server.test.ts`
  - Unit-tests the server without launching Obsidian.

## Constants

Use a fixed default port for the CI suite:

```ts
export const DEFAULT_MOCK_LLM_PORT = 43117;
export const MOCK_LLM_BASE_URL = `http://127.0.0.1:${DEFAULT_MOCK_LLM_PORT}`;
export const MOCK_LLM_OPENAI_BASE_URL = `${MOCK_LLM_BASE_URL}/v1`;
```

The fixed port keeps the fixture settings deterministic. If a local process occupies the port, the CI E2E run should fail clearly; do not silently choose a different port unless the fixture settings are also rewritten before each reset.

---

### Task 1: Add HTTP Mock Server Unit Coverage

**Files:**
- Create: `src/__tests__/e2e-mock-llm-server.test.ts`
- Create later: `tests/e2e/support/mock-llm-server.ts`

- [x] **Step 1: Write the failing server test**

Create `src/__tests__/e2e-mock-llm-server.test.ts`:

```ts
import { request } from 'node:http';
import {
	DEFAULT_MOCK_LLM_PORT,
	createMockLLMServer,
	type MockLLMServer,
} from '../../tests/e2e/support/mock-llm-server';

function httpJson<T>(method: string, path: string, body?: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: DEFAULT_MOCK_LLM_PORT,
				path,
				method,
				headers: payload
					? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
					: undefined,
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => {
					if ((res.statusCode ?? 500) >= 400) {
						reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
						return;
					}
					resolve(raw ? JSON.parse(raw) as T : undefined as T);
				});
			}
		);
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

describe('mock LLM server', () => {
	let server: MockLLMServer;

	beforeEach(async () => {
		server = createMockLLMServer({ port: DEFAULT_MOCK_LLM_PORT });
		await server.start();
		await httpJson('POST', '/__mock__/reset');
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns queued chat responses and captures requests', async () => {
		await httpJson('POST', '/__mock__/queue', {
			statusCode: 200,
			body: {
				id: 'cmpl_mock',
				object: 'chat.completion',
				created: 1,
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					message: { role: 'assistant', content: 'pong' },
					finish_reason: 'stop',
				}],
			},
		});

		const response = await httpJson<{ choices: Array<{ message: { content: string } }> }>(
			'POST',
			'/v1/chat/completions',
			{ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }] }
		);
		const calls = await httpJson<Array<{ path: string; body: { model: string } }>>('GET', '/__mock__/calls');

		expect(response.choices[0].message.content).toBe('pong');
		expect(calls).toHaveLength(1);
		expect(calls[0].path).toBe('/v1/chat/completions');
		expect(calls[0].body.model).toBe('gpt-4o-mini');
	});
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/__tests__/e2e-mock-llm-server.test.ts --runInBand
```

Expected: fail with `Cannot find module '../../tests/e2e/support/mock-llm-server'`.

- [x] **Step 3: Commit the red test only if working in a shared TDD branch**

Normally skip this commit; keep the red test local and proceed to Task 2.

---

### Task 2: Implement `mock-llm-server.ts`

**Files:**
- Create: `tests/e2e/support/mock-llm-server.ts`
- Test: `src/__tests__/e2e-mock-llm-server.test.ts`

- [x] **Step 1: Add the server implementation**

Create `tests/e2e/support/mock-llm-server.ts`:

```ts
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
```

- [x] **Step 2: Run the server unit test**

Run:

```bash
npm test -- src/__tests__/e2e-mock-llm-server.test.ts --runInBand
```

Expected: pass.

- [x] **Step 3: Run type-check**

Run:

```bash
npm run type-check
```

Expected: pass.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/support/mock-llm-server.ts src/__tests__/e2e-mock-llm-server.test.ts
git commit -m "test: add local llm mock server"
```

---

### Task 3: Replace `browser.mock` Client API

**Files:**
- Modify: `tests/e2e/support/mock-llm.ts`
- Test: `src/__tests__/e2e-mock-llm-server.test.ts`

- [x] **Step 1: Replace `mock-llm.ts` with admin-client implementation**

Replace `tests/e2e/support/mock-llm.ts`:

```ts
import { request } from 'node:http';
import {
	DEFAULT_MOCK_LLM_PORT,
	type CapturedLLMCall,
	type QueuedLLMResponse,
} from './mock-llm-server';

function adminJson<T>(method: string, route: string, body?: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{
				hostname: '127.0.0.1',
				port: DEFAULT_MOCK_LLM_PORT,
				path: route,
				method,
				headers: payload
					? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
					: undefined,
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => { raw += chunk; });
				res.on('end', () => {
					if ((res.statusCode ?? 500) >= 400) {
						reject(new Error(`Mock LLM admin ${method} ${route} failed: ${res.statusCode} ${raw}`));
						return;
					}
					resolve(raw ? JSON.parse(raw) as T : undefined as T);
				});
			}
		);
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function queue(response: QueuedLLMResponse): Promise<void> {
	return adminJson<void>('POST', '/__mock__/queue', response);
}

function chatCompletion(content: string): QueuedLLMResponse {
	return {
		statusCode: 200,
		body: {
			id: 'cmpl_mock',
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: 'gpt-4o-mini',
			choices: [{
				index: 0,
				message: { role: 'assistant', content },
				finish_reason: 'stop',
			}],
			usage: { prompt_tokens: 1, completion_tokens: content.length, total_tokens: content.length + 1 },
		},
	};
}

export const mockLLM = {
	async replyWith(text: string): Promise<void> {
		await queue(chatCompletion(text));
	},

	async toolCall(name: string, args: Record<string, unknown>, id = 'call_mock_1'): Promise<void> {
		await queue({
			statusCode: 200,
			body: {
				id: 'cmpl_tool_mock',
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					message: {
						role: 'assistant',
						content: '',
						tool_calls: [{
							id,
							type: 'function',
							function: { name, arguments: JSON.stringify(args) },
						}],
					},
					finish_reason: 'tool_calls',
				}],
			},
		});
	},

	async streaming(chunks: string[]): Promise<void> {
		await queue({
			statusCode: 200,
			body: null,
			streamChunks: chunks.map((chunk, index) => JSON.stringify({
				id: 'cmpl_stream_mock',
				object: 'chat.completion.chunk',
				created: Math.floor(Date.now() / 1000),
				model: 'gpt-4o-mini',
				choices: [{
					index: 0,
					delta: { content: chunk },
					finish_reason: index === chunks.length - 1 ? 'stop' : null,
				}],
			})),
		});
	},

	async errorStatus(code: 401 | 429 | 500): Promise<void> {
		await queue({
			statusCode: code,
			body: { error: { message: `Mock LLM error ${code}`, type: 'mock_error', code } },
		});
	},

	async getCalls(): Promise<CapturedLLMCall[]> {
		return adminJson<CapturedLLMCall[]>('GET', '/__mock__/calls');
	},

	async clearAll(): Promise<void> {
		await adminJson<void>('POST', '/__mock__/reset');
	},
};
```

- [x] **Step 2: Verify no Bidi API remains**

Run:

```bash
rg -n "browser\\.mock|WebDriver Bidi|Bidi" tests/e2e
```

Expected: only README/spec comments remain until Task 6 removes them; no `browser.mock` in TypeScript code.

- [x] **Step 3: Run lint and type-check**

Run:

```bash
npm run lint
npm run type-check
```

Expected: lint exits 0 with existing sentence-case warnings only; type-check passes.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/support/mock-llm.ts
git commit -m "test: replace browser mock llm client"
```

---

### Task 4: Wire Mock Server Into WDIO CI

**Files:**
- Modify: `tests/e2e/config/wdio.ci.conf.ts`
- Modify: `tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user/settings.json`

- [x] **Step 1: Start and stop the server in CI config**

Modify `tests/e2e/config/wdio.ci.conf.ts`:

```ts
/**
 * CI E2E config — mocked LLM, mocked MCP subprocess, real persistence.
 * No API keys required; runs offline.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { baseConfig } from '../../../wdio.conf';
import { resetVaultTemplate } from '../support/vault-fixture';
import { createMockLLMServer, type MockLLMServer } from '../support/mock-llm-server';

let mockServer: MockLLMServer | null = null;

export const config: Options.Testrunner = {
	...baseConfig,

	specs: [path.resolve('tests/e2e/specs/**/*.spec.ts')],

	exclude: [
		...(baseConfig.exclude ?? []),
		path.resolve('tests/e2e/specs/release/**'),
	],

	mochaOpts: {
		ui: 'bdd',
		timeout: 60 * 1000,
	},

	async onPrepare() {
		mockServer = createMockLLMServer();
		await mockServer.start();
		await resetVaultTemplate();
	},

	async onComplete() {
		await mockServer?.stop();
		mockServer = null;
	},
};
```

- [x] **Step 2: Point the seeded provider at the stub**

Modify `tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user/settings.json` so the seeded OpenAI provider has:

```json
"baseUrl": "http://127.0.0.1:43117/v1"
```

Keep `provider`, `apiKey`, `cachedModels`, `defaultModel`, and `titleSummaryModel` unchanged.

- [x] **Step 3: Run type-check**

Run:

```bash
npm run type-check
```

Expected: pass.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/config/wdio.ci.conf.ts tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user/settings.json
git commit -m "test: run llm mock server in e2e ci"
```

---

### Task 5: Restore Smoke Chat Round-Trip Assertion

**Files:**
- Modify: `tests/e2e/specs/00-smoke.spec.ts`
- Test indirectly uses: `tests/e2e/pages/chat/chat-view.page.ts`
- Test indirectly uses: `tests/e2e/support/vault-fixture.ts`

- [x] **Step 1: Add the failing smoke assertion**

Modify `tests/e2e/specs/00-smoke.spec.ts`:

```ts
import { mockLLM } from '../support/mock-llm';
```

Add to `beforeEach` after `await vault.reset();`:

```ts
await mockLLM.clearAll();
```

Add this spec:

```ts
it('sends a mocked chat round-trip and persists the conversation', async () => {
	await chat.open();
	await chat.newChat();
	await mockLLM.replyWith('pong');

	await chat.sendMessage('ping');
	await chat.waitForReplyComplete();

	const messages = await chat.getMessages();
	expect(messages).toEqual([
		expect.objectContaining({ role: 'user', text: expect.stringContaining('ping') }),
		expect.objectContaining({ role: 'assistant', text: expect.stringContaining('pong') }),
	]);

	const conversationId = await chat.getConversationId();
	expect(conversationId).not.toBe('');
	const conversationPath = await vault.findConversationFile(conversationId);
	const conversation = await vault.readDataFile<{ messages: Array<{ role: string; content: string }> }>(conversationPath);
	expect(conversation.messages).toEqual([
		expect.objectContaining({ role: 'user', content: expect.stringContaining('ping') }),
		expect.objectContaining({ role: 'assistant', content: expect.stringContaining('pong') }),
	]);

	const calls = await mockLLM.getCalls();
	expect(calls).toHaveLength(1);
	expect(calls[0].body).toMatchObject({ model: 'gpt-4o-mini' });
});
```

- [x] **Step 2: Run smoke E2E**

Run:

```bash
npm run test:e2e:smoke
```

Expected: it may fail first if the page object cannot resolve `activeConversationId`; if so, proceed to Step 3.

- [x] **Step 3: Fix conversation id lookup if needed**

If `getConversationId()` returns `''`, update `tests/e2e/pages/chat/chat-view.page.ts` to read from plugin settings or DOM-backed state exposed by the plugin. Use this implementation:

```ts
async getConversationId(): Promise<string> {
	return browser.execute(() => {
		const app = (window as unknown as {
			app: {
				plugins: { plugins: Record<string, { settings?: { activeConversationId?: string | null } }> };
			};
		}).app;
		const plugin = app.plugins.plugins['intelligence-assistant'];
		return plugin?.settings?.activeConversationId ?? '';
	});
}
```

- [x] **Step 4: Re-run smoke E2E**

Run:

```bash
npm run test:e2e:smoke
```

Expected: all smoke specs pass.

- [x] **Step 5: Commit**

```bash
git add tests/e2e/specs/00-smoke.spec.ts tests/e2e/pages/chat/chat-view.page.ts
git commit -m "test: restore smoke chat round trip"
```

---

### Task 6: Update E2E Docs And Backlog

**Files:**
- Modify: `tests/e2e/README.md`
- Modify: `docs/project/e2e-backlog.md`

- [x] **Step 1: Update README layout and limitation**

In `tests/e2e/README.md`:

- Change `mock-llm.ts # Wraps browser.mock; usable once Bidi works (Phase 1)` to `mock-llm.ts # Talks to the local HTTP LLM stub`.
- Add `mock-llm-server.ts # Local OpenAI-compatible HTTP stub`.
- Replace the "Known limitation (Phase 0)" section with:

```md
## Mock LLM

The CI suite uses a local OpenAI-compatible HTTP stub at
`http://127.0.0.1:43117/v1`. The seeded provider in the vault template
points at this server, so specs exercise the plugin's normal network
path through `requestUrl` without requiring WebDriver Bidi or external
API keys.

Use `mockLLM.replyWith()`, `mockLLM.streaming()`, `mockLLM.toolCall()`,
`mockLLM.errorStatus()`, and `mockLLM.getCalls()` from specs.
```

- [x] **Step 2: Mark backlog items done**

In `docs/project/e2e-backlog.md`, after the implementation commits exist:

- Mark `Replace browser.mock with a Bidi-free LLM mocking layer` done with the commit hash from Task 4.
- Mark `Add the deferred chat round-trip assertion to the smoke spec` done with the commit hash from Task 5.
- Mark `First-class request-capture in mockLLM.getCalls()` done with the commit hash from Task 3 or Task 5, whichever introduced the final API.

- [x] **Step 3: Commit docs**

```bash
git add tests/e2e/README.md docs/project/e2e-backlog.md
git commit -m "docs: update e2e mock llm status"
```

---

### Task 7: Final Verification And Push

**Files:**
- No new files.

- [ ] **Step 1: Run fast unit checks**

Run:

```bash
npm test -- src/__tests__/e2e-mock-llm-server.test.ts src/__tests__/e2e-vault-fixture.test.ts --runInBand
```

Expected: both suites pass.

- [ ] **Step 2: Run full static checks**

Run:

```bash
npm run lint
npm run type-check
npm run build
```

Expected: lint exits 0 with existing sentence-case warnings only; type-check and build pass.

- [ ] **Step 3: Run smoke E2E**

Run:

```bash
npm run test:e2e:smoke
```

Expected: smoke suite passes, including chat round-trip and persistence assertion.

- [ ] **Step 4: Deploy locally**

Run:

```bash
npm run deploy
```

Expected: deploy verifies `main.js`, `manifest.json`, and `styles.css`.

- [ ] **Step 5: Push**

Run:

```bash
git status --short --branch
git push
```

Expected: branch `route-c-trinity-refactor` pushes to origin.

## Self-Review

- Spec coverage: covers Bidi replacement, API compatibility, request capture, smoke round-trip, persistence assertion, README, and backlog updates.
- Placeholder scan: no placeholder markers. All commands and file paths are concrete.
- Type consistency: `MockLLMServer`, `QueuedLLMResponse`, and `CapturedLLMCall` are defined before use; `mockLLM.getCalls()` returns `CapturedLLMCall[]`; `VaultFixture.findConversationFile()` returns plugin-relative paths compatible with `readDataFile()`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-e2e-bidi-free-llm-mock.md`.

Recommended execution: Inline Execution in this session, because the user explicitly asked to keep continuing Route C and this plan is a single coherent E2E infrastructure slice with tight feedback loops.
