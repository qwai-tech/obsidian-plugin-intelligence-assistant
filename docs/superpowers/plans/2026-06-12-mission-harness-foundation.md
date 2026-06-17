# Agent Mission Harness — Foundation (Plan 1 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a headless test harness that runs a *single scripted agent mission* end-to-end — real `AgentEngineLoop` orchestration + real builtin tools + an in-memory vault + an in-process mock LLM — and asserts the result via real side-effect oracles. This is the spine every later plan depends on.

**Architecture:** Reuse the existing, proven `mock-llm-server` (already runs inside jest) as the deterministic LLM seam, driving a real `custom`/OpenAI-compatible provider pointed at `127.0.0.1`. Assemble `AgentEngineLoop` with the *real* tool registry + builtin tools over a Map-backed in-memory vault, and the cheap in-memory variants of its other deps (`InMemoryStateStore`, `HistoryCompactor`, minimal stubs for sense/web-search). Collect the run's tool calls, tool results, final message, and the resulting vault state, and assert against them.

**Tech Stack:** TypeScript, jest + ts-jest + jsdom (existing), the existing `tests/e2e/support/mock-llm-server.ts` + `mock-llm.ts`, real `src/application/agents/**` and `src/application/tools/**`.

**Scope note:** This plan is plan 1 of a 5-plan sequence (foundation → mission library M1–M10 → mutation+flake meta-verification → performance suite → L3/L5/CI wiring). Plans 2–5 are written only after this skeleton is proven, because their concrete shape depends on the harness API that emerges here.

**Reference (spec):** `docs/superpowers/specs/2026-06-12-agent-centric-e2e-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `jest.config.js` (modify) | Let jest discover `tests/harness` + `tests/missions`; keep WDIO specs out. |
| `tests/harness/in-memory-vault.ts` (create) | Map-backed in-memory `Vault` + `createHarnessApp()` returning an `App`-shaped object the real tools can read/write. |
| `tests/harness/build-tool-registry.ts` (create) | Build a real `ToolRegistry` with `BuiltinToolSource` over the in-memory app. |
| `tests/harness/mock-llm-harness.ts` (create) | Start/stop the in-process mock LLM server; re-export `mockLLM`. |
| `tests/harness/mission-runner.ts` (create) | Assemble `AgentEngineLoop` deps and run one mission, returning a `MissionOutcome`. |
| `tests/harness/mission-types.ts` (create) | `MissionDefinition`, `MissionOutcome`, oracle assert helpers. |
| `tests/missions/_proving/pm1-read.mission.test.ts` (create) | Proving mission: read a note → report → assert tool-log + final-content oracle. |
| `tests/missions/_proving/pm2-write.mission.test.ts` (create) | Proving mission: autonomous write → assert real vault side-effect oracle. |
| `package.json` (modify) | Add `test:missions` script. |

---

## Task 1: Wire jest to discover harness + mission tests

**Files:**
- Modify: `jest.config.js`
- Test: `tests/harness/_config-smoke.test.ts` (temporary, deleted in Step 5)

- [ ] **Step 1: Write a failing config-smoke test**

Create `tests/harness/_config-smoke.test.ts`:

```typescript
describe('jest harness discovery', () => {
  it('runs tests under tests/harness', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to confirm jest does NOT yet see it**

Run: `npx jest tests/harness/_config-smoke.test.ts`
Expected: `No tests found` (because `jest.config.js` `roots` is `['<rootDir>/src']`).

- [ ] **Step 3: Update `jest.config.js`**

Change `roots` and `testPathIgnorePatterns` so jest picks up `tests/harness` + `tests/missions` but never the WDIO specs in `tests/e2e`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src', '<rootDir>/tests/harness', '<rootDir>/tests/missions'],
  testMatch: [
    '**/__tests__/**/*.{j,t}s?(x)',
    '**/?(*.)+(spec|test).{j,t}s?(x)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
    '^marked$': '<rootDir>/__mocks__/marked.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@plugin$': '<rootDir>/main.ts'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test-support/**'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(marked)/)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/test-support/',
    '/tests/e2e/'
  ]
};
```

- [ ] **Step 4: Run the smoke test and the full suite**

Run: `npx jest tests/harness/_config-smoke.test.ts`
Expected: PASS.

Run: `npx jest --listTests | grep -c 'tests/e2e'`
Expected: `0` (WDIO `.spec.ts` files are excluded from jest).

- [ ] **Step 5: Delete the temporary smoke test and commit**

```bash
rm tests/harness/_config-smoke.test.ts
git add jest.config.js
git commit -m "test: let jest discover harness and mission tests"
```

---

## Task 2: In-memory vault + harness App

**Files:**
- Create: `tests/harness/in-memory-vault.ts`
- Test: `tests/harness/in-memory-vault.test.ts`

The real builtin tools call: `app.vault.getAbstractFileByPath(path)`, `app.vault.read(file)`, `app.vault.create(path, content)`, `app.vault.modify(file, content)`, `app.vault.getMarkdownFiles()`, `app.vault.getFiles()`, `app.vault.adapter.{exists,read,write,list,mkdir}`, and `app.metadataCache.getFileCache(file)`. This module implements all of them over a `Map`.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/in-memory-vault.test.ts`:

```typescript
import { TFile } from 'obsidian';
import { createHarnessApp } from './in-memory-vault';

describe('in-memory harness vault', () => {
  it('seeds, reads, creates, modifies, and lists files', async () => {
    const app = createHarnessApp({ 'notes/a.md': 'hello' });

    const a = app.vault.getAbstractFileByPath('notes/a.md');
    expect(a).toBeInstanceOf(TFile);
    expect(await app.vault.read(a as TFile)).toBe('hello');

    await app.vault.create('notes/b.md', 'world');
    expect(await app.vault.adapter.exists('notes/b.md')).toBe(true);

    const b = app.vault.getAbstractFileByPath('notes/b.md') as TFile;
    await app.vault.modify(b, 'world!!');
    expect(await app.vault.read(b)).toBe('world!!');

    const md = app.vault.getMarkdownFiles().map((f) => f.path).sort();
    expect(md).toEqual(['notes/a.md', 'notes/b.md']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/harness/in-memory-vault.test.ts`
Expected: FAIL — `Cannot find module './in-memory-vault'`.

- [ ] **Step 3: Implement the in-memory vault**

Create `tests/harness/in-memory-vault.ts`:

```typescript
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

/** Map-backed vault store: path -> file content. */
export class InMemoryVault {
  private readonly files = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(seed)) {
      this.files.set(path, content);
    }
  }

  private makeTFile(path: string): TFile {
    const file = new TFile();
    file.path = path;
    file.name = path.split('/').pop() ?? path;
    const dot = file.name.lastIndexOf('.');
    file.extension = dot >= 0 ? file.name.slice(dot + 1) : '';
    file.basename = dot >= 0 ? file.name.slice(0, dot) : file.name;
    return file;
  }

  getAbstractFileByPath(path: string): TFile | null {
    return this.files.has(path) ? this.makeTFile(path) : null;
  }

  async read(file: TFile): Promise<string> {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`File not found: ${file.path}`);
    return content;
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
    this.files.set(path, content);
    return this.makeTFile(path);
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.files.set(file.path, content);
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.keys()]
      .filter((p) => p.endsWith('.md'))
      .map((p) => this.makeTFile(p));
  }

  getFiles(): TFile[] {
    return [...this.files.keys()].map((p) => this.makeTFile(p));
  }

  // Adapter surface used by tools/persistence.
  readonly adapter = {
    exists: async (path: string): Promise<boolean> => this.files.has(path),
    read: async (path: string): Promise<string> => {
      const content = this.files.get(path);
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    write: async (path: string, content: string): Promise<void> => {
      this.files.set(path, content);
    },
    mkdir: async (): Promise<void> => undefined,
    list: async (path: string): Promise<{ files: string[]; folders: string[] }> => {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const files = [...this.files.keys()].filter((p) => p.startsWith(prefix));
      return { files, folders: [] };
    },
  };

  /** Test-only inspector for the side-effect oracle. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files);
  }
}

export interface HarnessApp extends App {
  __vault: InMemoryVault;
}

/** Build an `App`-shaped object the real tools and services can use headless. */
export function createHarnessApp(seed: Record<string, string> = {}): HarnessApp {
  const vault = new InMemoryVault(seed);
  const app = {
    vault,
    metadataCache: {
      getFileCache: () => null,
    },
    workspace: {
      getActiveFile: () => null,
      getLeavesOfType: () => [],
      onLayoutReady: (cb: () => void) => cb(),
    },
  } as unknown as HarnessApp;
  app.__vault = vault;
  return app;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/harness/in-memory-vault.test.ts`
Expected: PASS.

> Integration note: `TFile` here comes from `__mocks__/obsidian.ts`. If `new TFile()` does not accept property assignment, inspect `__mocks__/obsidian.ts:200-216` and add the `path`/`name`/`basename`/`extension` fields to the mock's `TFile` class. This is the only place the obsidian mock may need a one-line extension.

- [ ] **Step 5: Commit**

```bash
git add tests/harness/in-memory-vault.ts tests/harness/in-memory-vault.test.ts
git commit -m "test: add in-memory vault and harness App"
```

---

## Task 3: Real tool registry over the in-memory vault

**Files:**
- Create: `tests/harness/build-tool-registry.ts`
- Test: `tests/harness/build-tool-registry.test.ts`

This proves the **real** builtin tools (`read_file`, `write_file`) operate against the in-memory vault — the oracle foundation. Per the spec, `write_file` returns a *proposal* (not an applied write) unless autonomy is on; this task asserts exactly that behavior.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/build-tool-registry.test.ts`:

```typescript
import { createHarnessApp } from './in-memory-vault';
import { buildHarnessToolRegistry } from './build-tool-registry';

describe('harness tool registry', () => {
  it('reads a seeded file through the real read_file tool', async () => {
    const app = createHarnessApp({ 'test-note.md': 'AGENT_TOOL_SENTINEL' });
    const registry = await buildHarnessToolRegistry(app);

    const result = await registry.executeTool('read_file', { path: 'test-note.md' });

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.result)).toContain('AGENT_TOOL_SENTINEL');
  });

  it('returns a write proposal (no vault mutation) from write_file', async () => {
    const app = createHarnessApp({});
    const registry = await buildHarnessToolRegistry(app);

    const result = await registry.executeTool('write_file', {
      path: 'out.md',
      content: 'drafted',
    });

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.result)).toContain('write_proposal');
    // Proposal only — the vault is untouched until autonomy applies it.
    expect(await app.vault.adapter.exists('out.md')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/harness/build-tool-registry.test.ts`
Expected: FAIL — `Cannot find module './build-tool-registry'`.

- [ ] **Step 3: Implement the registry builder**

Create `tests/harness/build-tool-registry.ts`:

```typescript
import type { App } from 'obsidian';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';

/** Builtin tools enabled in the harness by default. */
const DEFAULT_ENABLED_BUILTINS = [
  'read_file',
  'write_file',
  'search_files',
  'create_note',
];

export async function buildHarnessToolRegistry(
  app: App,
  enabledTypes: string[] = DEFAULT_ENABLED_BUILTINS,
): Promise<ToolRegistry> {
  const registry = new ToolRegistry();
  registry.registerSource(new BuiltinToolSource(app, () => enabledTypes));
  await registry.reload();
  return registry;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/harness/build-tool-registry.test.ts`
Expected: PASS.

> Integration note: confirm `ToolRegistry`'s constructor takes no required args and exposes `registerSource` + `reload` + `executeTool` as documented (`src/application/tools/tool-registry.ts:38,73,140`). If `reload()` has a different name, inspect that file and use the real method.

- [ ] **Step 5: Commit**

```bash
git add tests/harness/build-tool-registry.ts tests/harness/build-tool-registry.test.ts
git commit -m "test: build real tool registry over in-memory vault"
```

---

## Task 4: Mock-LLM harness wrapper

**Files:**
- Create: `tests/harness/mock-llm-harness.ts`
- Test: `tests/harness/mock-llm-harness.test.ts`

Wrap the existing in-process mock server so each mission test starts/stops it cleanly and queues a trajectory with `mockLLM`.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/mock-llm-harness.test.ts`:

```typescript
import { request } from 'node:http';
import { DEFAULT_MOCK_LLM_PORT } from '../e2e/support/mock-llm-server';
import { startMockLLM, stopMockLLM, mockLLM } from './mock-llm-harness';

function postChat(body: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        hostname: '127.0.0.1',
        port: DEFAULT_MOCK_LLM_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve(raw));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('mock LLM harness', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('serves a queued reply in jest', async () => {
    await mockLLM.replyWith('pong');
    const raw = await postChat({ model: 'mock-model', messages: [{ role: 'user', content: 'ping' }] });
    expect(raw).toContain('pong');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/harness/mock-llm-harness.test.ts`
Expected: FAIL — `Cannot find module './mock-llm-harness'`.

- [ ] **Step 3: Implement the wrapper**

Create `tests/harness/mock-llm-harness.ts`:

```typescript
import { createMockLLMServer, DEFAULT_MOCK_LLM_PORT, type MockLLMServer } from '../e2e/support/mock-llm-server';
import { mockLLM } from '../e2e/support/mock-llm';

let server: MockLLMServer | null = null;

export async function startMockLLM(): Promise<void> {
  server = createMockLLMServer({ port: DEFAULT_MOCK_LLM_PORT });
  await server.start();
  await mockLLM.clearAll();
}

export async function stopMockLLM(): Promise<void> {
  await server?.stop();
  server = null;
}

export { mockLLM };
export { DEFAULT_MOCK_LLM_PORT };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/harness/mock-llm-harness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/harness/mock-llm-harness.ts tests/harness/mock-llm-harness.test.ts
git commit -m "test: add in-process mock LLM harness wrapper"
```

---

## Task 5: Walking skeleton — run AgentEngineLoop end-to-end

**Files:**
- Create: `tests/harness/mission-runner.ts`
- Test: `tests/harness/mission-runner.test.ts`

This is the integration spike. It mirrors `tests/e2e/specs/agents/tool-call-loop.spec.ts` but headless, and resolves the remaining seams (provider HTTP mechanism under jsdom; the `senseService`/`webSearchService` stubs). The test is the source of truth — make it green by filling exactly what the failing stack trace demands.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/mission-runner.test.ts`:

```typescript
import { createHarnessApp } from './in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from './mock-llm-harness';
import { runAgentMission } from './mission-runner';

interface StreamChatRequest {
  stream?: boolean;
  messages?: Array<{ role: string; content: string }>;
  tools?: Array<{ type: string; function: { name: string } }>;
}

describe('mission runner walking skeleton', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('runs a one-tool agent trajectory headless and reports the sentinel', async () => {
    // Golden trajectory: read the note, then answer with its content.
    await mockLLM.toolCall('read_file', { path: 'test-note.md' });
    await mockLLM.replyWith('The note contains AGENT_TOOL_SENTINEL from the vault.');

    const app = createHarnessApp({ 'test-note.md': 'AGENT_TOOL_SENTINEL' });

    const outcome = await runAgentMission({
      app,
      userMessage: 'Read test-note.md and report the sentinel.',
    });

    expect(outcome.error).toBeUndefined();
    expect(outcome.toolCalls.map((t) => t.toolName)).toContain('read_file');
    expect(outcome.finalMessage?.content).toContain('AGENT_TOOL_SENTINEL');

    const streamCalls = (await mockLLM.getCalls())
      .map((c) => c.body as StreamChatRequest | null)
      .filter((b) => b?.stream === true);
    expect(streamCalls).toHaveLength(2);
    expect(streamCalls[0]?.tools?.map((t) => t.function.name)).toContain('read_file');
    expect(streamCalls[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'tool', content: expect.stringContaining('AGENT_TOOL_SENTINEL') }),
      ]),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/harness/mission-runner.test.ts`
Expected: FAIL — `Cannot find module './mission-runner'`.

- [ ] **Step 3: Implement the mission runner**

Create `tests/harness/mission-runner.ts`:

```typescript
import type { App } from 'obsidian';
import { AgentEngineLoop } from '@/application/agents/agent-engine-loop';
import { HistoryCompactor } from '@/application/agents/history-compactor';
import { AgentSenseService } from '@/application/agents/agent-sense-service';
import { WebSearchService } from '@/application/services/web-search-service';
import { InMemoryStateStore } from '@/application/agents/kernel/agent-engine-core';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import type { Message } from '@/types/core/conversation';
import type { AgentLoopOptions, AgentLoopCallbacks } from '@/application/agents/types';
import { buildHarnessToolRegistry } from './build-tool-registry';
import { DEFAULT_MOCK_LLM_PORT } from './mock-llm-harness';

const MOCK_MODEL = 'mock-model';
const MOCK_BASE_URL = `http://127.0.0.1:${DEFAULT_MOCK_LLM_PORT}/v1`;

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultRecord {
  toolName: string;
  success: boolean;
  output: string;
}

export interface MissionOutcome {
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  finalMessage?: Message;
  error?: Error;
  steps: number;
}

export interface RunMissionInput {
  app: App;
  userMessage: string;
  /** Enable autonomous vault writes (no proposal gating). Default false. */
  autonomousWrite?: boolean;
  /** Builtin tools to enable. Defaults to read/write/search/create. */
  enabledTools?: string[];
  /** Max wall-clock before the run is force-failed. Default 15s. */
  timeoutMs?: number;
}

/** Minimal stub RAGManager: harness missions in this plan run with RAG disabled. */
function stubRagManager(): unknown {
  return {
    isReady: () => false,
    search: async () => [],
    getRelevantContext: async () => '',
  };
}

/** Minimal stub IHttpClient: harness missions in this plan run with web search disabled. */
function stubHttpClient(): unknown {
  return { get: async () => ({}), post: async () => ({}) };
}

export async function runAgentMission(input: RunMissionInput): Promise<MissionOutcome> {
  const { app, userMessage, autonomousWrite = false, enabledTools, timeoutMs = 15_000 } = input;

  const toolRegistry = await buildHarnessToolRegistry(app, enabledTools);
  const ragManager = stubRagManager() as never;

  const loop = new AgentEngineLoop({
    app,
    toolRegistry: toolRegistry as never,
    senseService: new AgentSenseService(app, ragManager),
    historyCompactor: new HistoryCompactor(),
    webSearchService: new WebSearchService({ enabled: false } as never, stubHttpClient() as never),
    ragManager,
    agentRunStateStore: new InMemoryStateStore(),
    createProvider: () => {
      const config = {
        provider: 'custom' as const,
        apiKey: 'test-key',
        baseUrl: MOCK_BASE_URL,
      };
      return { provider: ProviderFactory.createProvider(config as never), providerId: 'custom' };
    },
    defaultModel: MOCK_MODEL,
  });

  const outcome: MissionOutcome = { toolCalls: [], toolResults: [], steps: 0 };

  const options: AgentLoopOptions = {
    model: MOCK_MODEL,
    mode: 'agent',
    agentId: undefined,
    agents: [
      {
        id: 'harness-agent',
        name: 'Harness Agent',
        maxSteps: 25,
        autonomousWrite,
      } as never,
    ],
  };

  const messages: Message[] = [{ role: 'user', content: userMessage }];

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      outcome.error = outcome.error ?? new Error(`Mission timed out after ${timeoutMs}ms`);
      resolve();
    }, timeoutMs);

    const callbacks: AgentLoopCallbacks = {
      onChunk: () => undefined,
      onToolCall: (toolName, args) => {
        outcome.steps += 1;
        outcome.toolCalls.push({ toolName, args });
      },
      onToolResult: (toolName, success, output) => {
        outcome.toolResults.push({ toolName, success, output });
      },
      onThought: () => undefined,
      onComplete: (finalMessage) => {
        outcome.finalMessage = finalMessage;
        clearTimeout(timer);
        resolve();
      },
      onError: (error) => {
        outcome.error = error;
        clearTimeout(timer);
        resolve();
      },
    };

    void loop.execute(messages, options, callbacks);
  });

  return outcome;
}
```

- [ ] **Step 4: Run the test and resolve each integration seam it surfaces**

Run: `npx jest tests/harness/mission-runner.test.ts`
Expected after the seams below are closed: PASS.

Work through failures in order — each has an exact resolution:

1. **`AgentEngineLoop` / `AgentSenseService` / type-only import names.** If any import path or class name differs, open the file listed in the spec reference table and use the real export. (`agent-engine-loop.ts`, `agent-sense-service.ts`, `web-search-service.ts`, `application/agents/kernel/agent-engine-core.ts`, `provider-factory.ts`.)

2. **Provider does not reach the mock server (no captured calls / timeout).** The `custom` provider is `OpenAIProvider` (`provider-factory.ts:30`). Determine its HTTP mechanism in `src/infrastructure/llm/` (grep the provider for `requestUrl` vs `fetch`):
   - If it uses **global `fetch`** — it already reaches `127.0.0.1`; no change needed.
   - If it uses Obsidian **`requestUrl`** — that call is stubbed in `__mocks__/obsidian.ts:218-226`. In `jest.setup.js`, replace the stub with a real Node `http` round-trip so the provider's request actually hits the mock server. Add:
     ```javascript
     // jest.setup.js — make obsidian.requestUrl perform a real localhost HTTP round-trip
     jest.mock('obsidian', () => {
       const actual = jest.requireActual('./__mocks__/obsidian');
       const { request } = require('node:http');
       return {
         ...actual,
         requestUrl: (opts) => new Promise((resolve, reject) => {
           const url = typeof opts === 'string' ? opts : opts.url;
           const u = new URL(url);
           const body = typeof opts === 'object' ? opts.body : undefined;
           const req = request(
             { hostname: u.hostname, port: u.port, path: u.pathname + u.search,
               method: (typeof opts === 'object' && opts.method) || 'GET', agent: false,
               headers: (typeof opts === 'object' && opts.headers) || {} },
             (res) => { let raw = ''; res.setEncoding('utf8');
               res.on('data', (c) => { raw += c; });
               res.on('end', () => resolve({ status: res.statusCode, text: raw, json: raw ? JSON.parse(raw) : undefined, headers: res.headers })); });
           req.on('error', reject);
           if (body) req.write(body);
           req.end();
         }),
       };
     });
     ```
     (Match the real `requestUrl` return shape the provider consumes — confirm field names against the provider code.)

3. **Loop never fires `onComplete` (sense/web-search stub crashes).** The timeout will trip and `outcome.error` will be set; read the stack in the captured error. Whatever method the loop actually calls on the stub `ragManager`/`httpClient`/`senseService` that is missing, add it to the stub returning a safe empty value. Keep stubs minimal — only add what the loop calls with RAG and web search disabled.

4. **`AgentLoopOptions.agents[0]` cast.** If the loop reads agent fields beyond `id`/`name`/`maxSteps`/`autonomousWrite`, import the real `Agent` factory `createTestAgent` from `src/test-support/test-utils.ts` and build the agent with it instead of the inline literal.

Re-run after each fix until green.

- [ ] **Step 5: Commit**

```bash
git add tests/harness/mission-runner.ts tests/harness/mission-runner.test.ts jest.setup.js
git commit -m "test: run AgentEngineLoop end-to-end headless (walking skeleton)"
```

---

## Task 6: Mission definition type + oracle helpers

**Files:**
- Create: `tests/harness/mission-types.ts`
- Test: `tests/harness/mission-types.test.ts`

Turn the imperative skeleton into a small declarative DSL so later plans add missions as data, not bespoke test code.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/mission-types.test.ts`:

```typescript
import { assertToolSequence, assertVaultFileContains, assertWithinBudget } from './mission-types';
import type { MissionOutcome } from './mission-runner';
import { createHarnessApp } from './in-memory-vault';

function outcome(partial: Partial<MissionOutcome>): MissionOutcome {
  return { toolCalls: [], toolResults: [], steps: 0, ...partial };
}

describe('mission oracle helpers', () => {
  it('assertToolSequence passes on an exact ordered match', () => {
    const o = outcome({
      toolCalls: [
        { toolName: 'read_file', args: {} },
        { toolName: 'write_file', args: {} },
      ],
    });
    expect(() => assertToolSequence(o, ['read_file', 'write_file'])).not.toThrow();
  });

  it('assertToolSequence throws on a mismatch', () => {
    const o = outcome({ toolCalls: [{ toolName: 'read_file', args: {} }] });
    expect(() => assertToolSequence(o, ['write_file'])).toThrow(/expected tool sequence/i);
  });

  it('assertVaultFileContains reads the real in-memory side effect', () => {
    const app = createHarnessApp({ 'out.md': 'final content' });
    expect(() => assertVaultFileContains(app, 'out.md', 'final')).not.toThrow();
    expect(() => assertVaultFileContains(app, 'out.md', 'missing')).toThrow(/does not contain/i);
  });

  it('assertWithinBudget throws when steps exceed budget', () => {
    const o = outcome({ steps: 30 });
    expect(() => assertWithinBudget(o, { steps: 10 })).toThrow(/budget/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/harness/mission-types.test.ts`
Expected: FAIL — `Cannot find module './mission-types'`.

- [ ] **Step 3: Implement the types and helpers**

Create `tests/harness/mission-types.ts`:

```typescript
import type { MissionOutcome } from './mission-runner';
import type { HarnessApp } from './in-memory-vault';

export interface MissionBudget {
  steps?: number;
  tokens?: number;
  wallMs?: number;
}

/** Declarative mission definition consumed by later plans. */
export interface MissionDefinition {
  name: string;
  userMessage: string;
  seed: Record<string, string>;
  autonomousWrite?: boolean;
  enabledTools?: string[];
  trajectory: Array<
    | { type: 'tool'; name: string; args: Record<string, unknown> }
    | { type: 'final'; text: string }
  >;
  expect: {
    toolSequence?: string[];
    finalContains?: string;
    vaultFiles?: Array<{ path: string; contains: string }>;
  };
  budget?: MissionBudget;
}

export function assertToolSequence(outcome: MissionOutcome, expected: string[]): void {
  const actual = outcome.toolCalls.map((t) => t.toolName);
  const matches = actual.length === expected.length && expected.every((name, i) => actual[i] === name);
  if (!matches) {
    throw new Error(`expected tool sequence ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

export function assertVaultFileContains(app: HarnessApp, path: string, needle: string): void {
  const snapshot = app.__vault.snapshot();
  const content = snapshot[path];
  if (content === undefined) throw new Error(`vault file not found: ${path}`);
  if (!content.includes(needle)) {
    throw new Error(`vault file ${path} does not contain ${JSON.stringify(needle)}`);
  }
}

export function assertWithinBudget(outcome: MissionOutcome, budget: MissionBudget): void {
  if (budget.steps !== undefined && outcome.steps > budget.steps) {
    throw new Error(`step budget exceeded: ${outcome.steps} > ${budget.steps}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/harness/mission-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/harness/mission-types.ts tests/harness/mission-types.test.ts
git commit -m "test: add mission definition type and oracle helpers"
```

---

## Task 7: Proving mission PM1 — read-and-report (tool-log + final-content oracle)

**Files:**
- Create: `tests/missions/_proving/pm1-read.mission.test.ts`

Re-express the skeleton as a declarative mission, proving the DSL + oracle helpers work together.

- [ ] **Step 1: Write the failing test**

Create `tests/missions/_proving/pm1-read.mission.test.ts`:

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertWithinBudget, type MissionDefinition } from '../../harness/mission-types';

const PM1: MissionDefinition = {
  name: 'PM1 read-and-report',
  userMessage: 'Read test-note.md and report the sentinel.',
  seed: { 'test-note.md': 'AGENT_TOOL_SENTINEL' },
  trajectory: [
    { type: 'tool', name: 'read_file', args: { path: 'test-note.md' } },
    { type: 'final', text: 'The note contains AGENT_TOOL_SENTINEL.' },
  ],
  expect: { toolSequence: ['read_file'], finalContains: 'AGENT_TOOL_SENTINEL' },
  budget: { steps: 2 },
};

describe(PM1.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('completes the mission within its oracle and budget', async () => {
    for (const turn of PM1.trajectory) {
      if (turn.type === 'tool') await mockLLM.toolCall(turn.name, turn.args);
      else await mockLLM.replyWith(turn.text);
    }

    const app = createHarnessApp(PM1.seed);
    const outcome = await runAgentMission({ app, userMessage: PM1.userMessage });

    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, PM1.expect.toolSequence!);
    expect(outcome.finalMessage?.content).toContain(PM1.expect.finalContains!);
    assertWithinBudget(outcome, PM1.budget!);
  });
});
```

- [ ] **Step 2: Run it to verify it fails first, then passes**

Run: `npx jest tests/missions/_proving/pm1-read.mission.test.ts`
Expected: PASS (all dependencies already exist from Tasks 2–6). If it fails, the failure is in the oracle wiring — fix in `mission-types.ts`, not here.

- [ ] **Step 3: Commit**

```bash
git add tests/missions/_proving/pm1-read.mission.test.ts
git commit -m "test: PM1 proving mission (tool-log + final-content oracle)"
```

---

## Task 8: Proving mission PM2 — autonomous write (real vault side-effect oracle)

**Files:**
- Create: `tests/missions/_proving/pm2-write.mission.test.ts`

Proves the **real side-effect oracle**: with `autonomousWrite: true`, the agent's `write_file` proposal is auto-applied and the in-memory vault actually changes.

- [ ] **Step 1: Write the failing test**

Create `tests/missions/_proving/pm2-write.mission.test.ts`:

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertVaultFileContains, type MissionDefinition } from '../../harness/mission-types';

const PM2: MissionDefinition = {
  name: 'PM2 autonomous-write',
  userMessage: 'Create summary.md with the text DONE_SENTINEL. Do it autonomously without confirmation.',
  seed: {},
  autonomousWrite: true,
  trajectory: [
    { type: 'tool', name: 'write_file', args: { path: 'summary.md', content: 'DONE_SENTINEL' } },
    { type: 'final', text: 'Created summary.md.' },
  ],
  expect: {
    toolSequence: ['write_file'],
    vaultFiles: [{ path: 'summary.md', contains: 'DONE_SENTINEL' }],
  },
  budget: { steps: 2 },
};

describe(PM2.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('auto-applies the write and the real vault reflects it', async () => {
    for (const turn of PM2.trajectory) {
      if (turn.type === 'tool') await mockLLM.toolCall(turn.name, turn.args);
      else await mockLLM.replyWith(turn.text);
    }

    const app = createHarnessApp(PM2.seed);
    const outcome = await runAgentMission({
      app,
      userMessage: PM2.userMessage,
      autonomousWrite: PM2.autonomousWrite,
    });

    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, PM2.expect.toolSequence!);
    for (const file of PM2.expect.vaultFiles!) {
      assertVaultFileContains(app, file.path, file.contains);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npx jest tests/missions/_proving/pm2-write.mission.test.ts`
Expected: PASS.

> Integration note: auto-apply is gated by `autonomousWrite: true` on the agent OR an autonomy intent phrase in the user message (`agent-engine-loop.ts:98` + `kernel-tool-registry-adapter.ts:67-82`). This mission sets both belt and suspenders. If the write is not applied, confirm `applyWriteProposal` calls `app.vault.create`/`modify` (the in-memory vault implements both) — inspect `kernel-tool-registry-adapter.ts:26-42`.

- [ ] **Step 3: Commit**

```bash
git add tests/missions/_proving/pm2-write.mission.test.ts
git commit -m "test: PM2 proving mission (real vault side-effect oracle)"
```

---

## Task 9: npm script + full-suite verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the `test:missions` script**

In `package.json` `scripts`, add after the existing `test:e2e:smoke` line:

```json
"test:missions": "jest tests/harness tests/missions",
```

- [ ] **Step 2: Run the whole mission + harness suite**

Run: `npm run test:missions`
Expected: PASS — all harness tests and PM1/PM2 green.

- [ ] **Step 3: Run the existing unit suite to confirm no regression**

Run: `npm test`
Expected: PASS — the jest config change did not break the existing `src/__tests__` suite, and no WDIO specs were picked up.

- [ ] **Step 4: Run lint and build (CLAUDE.md post-task requirement)**

Run: `npm run lint`
Expected: no new errors/warnings.

Run: `npm run build`
Expected: build succeeds.

Run: `node scripts/deploy.js --local`
Expected: deploy succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "test: add test:missions script for the headless mission harness"
```

---

## Definition of Done

- `npm run test:missions` is green: the harness runs a scripted agent mission end-to-end through real `AgentEngineLoop` + real builtin tools + in-memory vault + in-process mock LLM.
- Both oracle types are proven: PM1 (tool-call-log + final content) and PM2 (real vault side effect under autonomous write).
- `npm test` (existing unit suite) still passes; no WDIO specs leak into jest.
- The harness exposes a reusable API — `createHarnessApp`, `runAgentMission`, `MissionDefinition`, and the oracle helpers — that Plan 2 (mission library M1–M10) builds on directly.

---

## Self-Review Notes

- **Spec coverage:** This plan implements only the L2 harness *engine* + the proving-mission scaffold from spec §2/§4. The mission library (M1–M10, spec §6), coverage manifest (§6), mutation testing (§3), flake-soak (§3), L4 performance (§5), and L3/L5/CI wiring (§4/§7) are explicitly deferred to plans 2–5 — by design, since they depend on this harness API.
- **Integration seams (not placeholders):** Tasks 2, 3, 5, and 8 carry "Integration note" callouts naming the exact file + line to inspect if a seam differs from the documented interface. These are TDD convergence points with concrete resolutions, not deferred work.
- **Type consistency:** `MissionOutcome` (Task 5) is consumed unchanged by `mission-types.ts` (Task 6) and both proving missions (Tasks 7–8). `createHarnessApp` returns `HarnessApp` with `__vault.snapshot()`, used by `assertVaultFileContains`. `runAgentMission`'s `RunMissionInput` fields (`app`, `userMessage`, `autonomousWrite`, `enabledTools`) match every call site.
