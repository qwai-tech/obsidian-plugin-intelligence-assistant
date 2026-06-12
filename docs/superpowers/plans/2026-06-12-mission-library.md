# Agent Mission Library (Plan 2 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the real agent-mission library on top of the proven harness — deterministic missions that deep-test the agent's reliability and efficiency: multi-step large tasks, permission isolation, max-steps budget, tool-error recovery, stop/abort, RAG injection, and a non-builtin tool source — plus a coverage manifest that fails CI when a capability ships untested.

**Architecture:** Extend `runAgentMission` with the seams these missions need (custom `toolAccess`, `checkAbort`/`abortAfterToolCalls`, RAG injection, extra tool sources), then add each mission as a declarative test using the existing `MissionDefinition` DSL + oracle helpers. Only the LLM, RAG manager, and web-search client are stubbed; the orchestration, tools, permission resolution, budget enforcement, and write-apply are all real.

**Tech Stack:** TypeScript, jest + ts-jest + jsdom, the `tests/harness/` foundation from Plan 1.

**Reference (spec):** `docs/superpowers/specs/2026-06-12-agent-centric-e2e-design.md` §6 (mission library) and §3 (coverage manifest).

**Verified mechanisms (from codebase exploration — load-bearing):**
- **Max-steps:** when `context.state.step >= softBudget`, the planner returns `stopAction('max_steps_reached')`; the loop fires `onComplete` (NOT `onError`) with final content containing `"Reached the agent step budget of N"`. Budget = agent `maxSteps` (no ESTIMATED_STEPS marker needed). (`agent-engine-loop.ts:71,150-161`, `provider-kernel-planner.ts:104`)
- **Tool error:** a tool returning `{success:false,error}` → `onToolResult(name, false, 'Tool "X" failed: ...')`, the error is fed to the LLM as a `{role:'tool', content:error}` message, and the adapter throws so the agent can recover on the next turn. 3 consecutive same-tool failures sets a fatal stop. `read_file` on a missing path really returns `success:false`. (`kernel-tool-registry-adapter.ts:67-92`, `file-tools.ts:24-47`)
- **Permission isolation:** `AgentToolAccess = { sources: Record<string,'all'|string[]> }`; `resolveForAgent` filters which tools the LLM sees. A disallowed tool is registered only as a stub that emits `onToolResult(name,false,'Tool "X" is not enabled for this agent')` and throws — the REAL tool never executes, so no side effect. toolId = `${kind}:${sourceId}:${rawName}` e.g. `builtin:builtin:read_file`; source key = `builtin:builtin`. (`tool-registry.ts:170-182`, `kernel-tool-registry-adapter.ts:95-113`)
- **Abort:** `callbacks.checkAbort()` polled at the start of each `plan()` and during streaming; when true the planner returns `stopAction('aborted')` → `onComplete` with partial `lastContent`, NO `onError`. (`provider-kernel-planner.ts:96,124`, `agent-engine-loop.ts:145-161`)
- **RAG:** with `options.enableRAG`, `AgentSenseService` calls `ragManager.query(userQuery, model, defaultModel)` returning `SearchResult[]` (`{chunk:{content,metadata:{path,title?}},similarity}`), formatted into a system message section "RAG context (Notes)". (`agent-sense-service.ts:36-129`)
- **Tool source:** `ToolSource = { kind; id; label; load():Promise<SourceTool[]>; dispose():Promise<void> }`; `SourceTool = { definition: ToolDefinition; execute(args):Promise<ToolResult> }`. Register via `registry.registerSource(src)` then `reload()`. (`tool-source.ts`, `builtin-tool-source.ts`)
- **Turn count:** one LLM request per step; N tool calls + 1 final = N+1 turns (PM1 proved 1+1=2). `outcome.steps` already counts stream requests.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `tests/harness/mission-runner.ts` (modify) | Add `toolAccess`, `abortAfterToolCalls`, `enableRAG`+`ragResults`, `extraToolSources` to `RunMissionInput`; wire each into the real loop. |
| `tests/harness/build-tool-registry.ts` (modify) | Accept optional `extraSources: ToolSource[]` to register alongside builtins. |
| `tests/harness/fake-rag.ts` (create) | `createFakeRagManager(results)` — a controllable RAGManager stub whose `query()` returns seeded results. |
| `tests/harness/fake-tool-source.ts` (create) | `createFakeToolSource(...)` — a minimal in-process `ToolSource` exposing a known tool. |
| `tests/missions/agent/m1-read-write.mission.test.ts` (create) | M1: read a note → autonomously write a summary (multi-step + side effect). |
| `tests/missions/agent/m4-batch-rewrite.mission.test.ts` (create) | M4: rewrite 3 notes (large multi-step task — flagship efficiency/reliability). |
| `tests/missions/agent/m5-permission-isolation.mission.test.ts` (create) | M5: agent without `write_file` requests it → denied, vault untouched. |
| `tests/missions/agent/m6-max-steps.mission.test.ts` (create) | M6: trajectory exceeds budget → graceful halt with budget message. |
| `tests/missions/agent/m7-tool-error-recovery.mission.test.ts` (create) | M7: read missing file → error fed back → agent recovers. |
| `tests/missions/agent/m8-stop.mission.test.ts` (create) | M8: abort mid-task → clean stop, remaining steps not executed. |
| `tests/missions/agent/m2-rag-injection.mission.test.ts` (create) | M2: seeded RAG context reaches the LLM request. |
| `tests/missions/agent/m-ext-tool-source.mission.test.ts` (create) | Non-builtin tool source: agent calls a fake MCP-kind tool. |
| `tests/missions/coverage-manifest.ts` + `.test.ts` (create) | Capability → mission map; meta-test asserts every mission file exists. |

---

## Task 1: Extend the mission runner with reliability seams

**Files:**
- Modify: `tests/harness/mission-runner.ts`
- Modify: `tests/harness/build-tool-registry.ts`
- Create: `tests/harness/fake-rag.ts`
- Create: `tests/harness/fake-tool-source.ts`
- Test: `tests/harness/mission-runner-extensions.test.ts`

- [ ] **Step 1: Write failing tests** for the four new seams

Create `tests/harness/mission-runner-extensions.test.ts`:

```typescript
import { createHarnessApp } from './in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from './mock-llm-harness';
import { runAgentMission } from './mission-runner';
import { createFakeToolSource } from './fake-tool-source';

describe('mission runner extensions', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('toolAccess restricts which tools execute (disallowed tool is denied, not executed)', async () => {
    await mockLLM.toolCall('write_file', { path: 'blocked.md', content: 'X' });
    await mockLLM.replyWith('I could not write.');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({
      app,
      userMessage: 'Try to write a file.',
      autonomousWrite: true,
      toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:read_file'] } },
    });
    expect(outcome.error).toBeUndefined();
    const wf = outcome.toolResults.find((r) => r.toolName === 'write_file');
    expect(wf?.success).toBe(false);
    expect(wf?.output).toMatch(/not enabled/i);
    expect(await app.vault.adapter.exists('blocked.md')).toBe(false);
  });

  it('abortAfterToolCalls stops the run early without error', async () => {
    await mockLLM.toolCall('read_file', { path: 'a.md' });
    await mockLLM.toolCall('read_file', { path: 'b.md' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({ 'a.md': 'A', 'b.md': 'B' });
    const outcome = await runAgentMission({
      app, userMessage: 'Read a then b.', abortAfterToolCalls: 1,
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.toolCallCount).toBe(1);
  });

  it('injects RAG context into the LLM request when enableRAG + ragResults given', async () => {
    await mockLLM.replyWith('answer');
    const app = createHarnessApp({});
    await runAgentMission({
      app,
      userMessage: 'What do my notes say?',
      enableRAG: true,
      ragResults: [{ path: 'kb.md', content: 'RAG_CONTEXT_SENTINEL', title: 'KB' }],
    });
    const calls = await mockLLM.getCalls();
    const firstChat = calls.find((c) => c.path === '/v1/chat/completions');
    expect(JSON.stringify(firstChat?.body)).toContain('RAG_CONTEXT_SENTINEL');
  });

  it('runs a tool from an injected non-builtin tool source', async () => {
    await mockLLM.toolCall('fake_echo', { text: 'hi' });
    await mockLLM.replyWith('echoed');
    const app = createHarnessApp({});
    const outcome = await runAgentMission({
      app,
      userMessage: 'Echo hi.',
      extraToolSources: [createFakeToolSource()],
      toolAccess: { sources: { 'builtin:builtin': 'all', 'mcp:fake': 'all' } },
    });
    expect(outcome.error).toBeUndefined();
    const echo = outcome.toolResults.find((r) => r.toolName === 'fake_echo');
    expect(echo?.success).toBe(true);
    expect(echo?.output).toContain('hi');
  });
});
```

- [ ] **Step 2: Run to confirm failures**

Run: `npx jest tests/harness/mission-runner-extensions.test.ts`
Expected: FAIL (new input fields/modules don't exist yet).

- [ ] **Step 3: Create `tests/harness/fake-tool-source.ts`**

```typescript
import type { ToolSource } from '@/application/tools/tool-source';
import type { SourceTool } from '@/types/common/tools';

/**
 * Minimal in-process tool source exposing a known `fake_echo` tool, for
 * deterministically testing the agent calling a NON-builtin tool without a
 * real subprocess. Uses kind 'mcp' so its source key is `mcp:fake`.
 */
export function createFakeToolSource(): ToolSource {
  const echo: SourceTool = {
    definition: {
      name: 'fake_echo',
      description: 'Echo the provided text back.',
      parameters: [{ name: 'text', type: 'string', description: 'Text to echo', required: true }],
    },
    execute: async (args: Record<string, unknown>) => ({
      success: true,
      result: `echo: ${String(args.text)}`,
    }),
  };
  return {
    kind: 'mcp',
    id: 'fake',
    label: 'Fake Tools',
    load: async () => [echo],
    dispose: async () => undefined,
  };
}
```
Confirm `ToolSourceKind` includes `'mcp'` and the `ToolSource`/`SourceTool`/`ToolDefinition` shapes match (`src/application/tools/tool-source.ts`, `src/types/common/tools.ts`). Adapt field names if the real `ToolParameter` differs.

- [ ] **Step 4: Create `tests/harness/fake-rag.ts`**

```typescript
export interface FakeRagResult {
  path: string;
  content: string;
  title?: string;
  similarity?: number;
}

/**
 * Controllable RAGManager stub. `query()` returns the seeded results shaped as
 * the real `SearchResult[]` the AgentSenseService consumes
 * ({ chunk: { content, metadata: { path, title } }, similarity }).
 */
export function createFakeRagManager(results: FakeRagResult[]): unknown {
  const searchResults = results.map((r) => ({
    chunk: { content: r.content, metadata: { path: r.path, title: r.title ?? r.path } },
    similarity: r.similarity ?? 0.9,
  }));
  return {
    isReady: () => true,
    query: async () => searchResults,
    getRelevantContext: async () => results.map((r) => r.content).join('\n'),
    indexMemory: async () => undefined,
    search: async () => searchResults,
  };
}
```
Confirm against `AgentSenseService.queryRag` (`agent-sense-service.ts`) that `query` returns objects with `.chunk.content` + `.chunk.metadata.path`/`.title` + `.similarity`. If `AgentSenseService` calls additional `ragManager` methods during sense with RAG enabled, add safe stubs for them.

- [ ] **Step 5: Modify `tests/harness/build-tool-registry.ts`** to accept extra sources

Add an optional `extraSources` param; register them after the builtin source, before `reload()`:
```typescript
import type { ToolSource } from '@/application/tools/tool-source';
// ...
export async function buildHarnessToolRegistry(
  app: App,
  enabledTypes?: string[],
  extraSources: ToolSource[] = [],
): Promise<ToolRegistry> {
  const getEnabled = enabledTypes ? () => enabledTypes : () => null;
  const registry = new ToolRegistry();
  registry.registerSource(new BuiltinToolSource(app, getEnabled));
  for (const src of extraSources) registry.registerSource(src);
  await registry.reload();
  return registry;
}
```

- [ ] **Step 6: Modify `tests/harness/mission-runner.ts`** to wire the new seams

Add to `RunMissionInput`:
```typescript
  toolAccess?: { sources: Record<string, 'all' | string[]> };
  abortAfterToolCalls?: number;
  enableRAG?: boolean;
  ragResults?: import('./fake-rag').FakeRagResult[];
  extraToolSources?: import('@/application/tools/tool-source').ToolSource[];
```
In `runAgentMission`:
- Build the registry with `extraToolSources`: `await buildHarnessToolRegistry(app, enabledTools, input.extraToolSources)`.
- Build `ragManager`: if `input.ragResults` given, `createFakeRagManager(input.ragResults)`, else the existing `stubRagManager()`. Use it for both `senseService` and `ragManager` deps.
- Agent toolAccess: pass `toolAccess: input.toolAccess ?? { sources: { 'builtin:builtin': 'all' } }` into `createTestAgent({ ... })`.
- Options: set `enableRAG: input.enableRAG ?? false`.
- checkAbort: in the callbacks object add `checkAbort: input.abortAfterToolCalls === undefined ? undefined : () => outcome.toolCallCount >= input.abortAfterToolCalls!`.

Keep all existing behavior (default toolAccess all-builtins, default no RAG, no abort).

- [ ] **Step 7: Run the extension tests + full suite**

Run: `npx jest tests/harness/mission-runner-extensions.test.ts` → PASS (all 4).
Debug guidance:
- If the disallowed-tool test fails because `write_file` still executed, re-check the toolId format in `toolAccess` (`builtin:builtin:read_file`) and that `resolveForAgent` excludes write_file. The REAL tool must not run (no `blocked.md`).
- If RAG content doesn't appear, confirm `enableRAG` flows into `senseService.sense` and the fake `query` shape matches; log the first chat request body.
- If the fake tool isn't found, confirm its source key `mcp:fake` is granted in `toolAccess` and `reload()` loaded it.

- [ ] **Step 8: Verify and commit**

Run: `npm test` (full suite green), `npm run lint`, `npm run build`, `npx tsc --noEmit -p tsconfig.json`.
```bash
git add tests/harness/mission-runner.ts tests/harness/build-tool-registry.ts tests/harness/fake-rag.ts tests/harness/fake-tool-source.ts tests/harness/mission-runner-extensions.test.ts
git commit -m "test: extend mission runner with toolAccess, abort, RAG, and extra tool sources"
```

---

## Task 2: M1 — read → autonomous write summary (multi-step + side effect)

**Files:** Create `tests/missions/agent/m1-read-write.mission.test.ts`

- [ ] **Step 1: Write the mission test**

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertVaultFileContains, assertWithinBudget, type MissionDefinition } from '../../harness/mission-types';

const M1: MissionDefinition = {
  name: 'M1 read-then-write-summary',
  userMessage: 'Read source.md and write a summary to summary.md. Do it autonomously without confirmation.',
  seed: { 'source.md': 'The mitochondria is the powerhouse of the cell. SOURCE_FACT.' },
  autonomousWrite: true,
  trajectory: [
    { type: 'tool', name: 'read_file', args: { path: 'source.md' } },
    { type: 'tool', name: 'write_file', args: { path: 'summary.md', content: 'Summary: SOURCE_FACT.' } },
    { type: 'final', text: 'Wrote summary.md.' },
  ],
  expect: {
    toolSequence: ['read_file', 'write_file'],
    vaultFiles: [{ path: 'summary.md', contains: 'SOURCE_FACT' }],
  },
  budget: { steps: 3 },
};

describe(M1.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('reads the source and autonomously writes a derived summary', async () => {
    for (const t of M1.trajectory) {
      if (t.type === 'tool') await mockLLM.toolCall(t.name, t.args);
      else await mockLLM.replyWith(t.text);
    }
    const app = createHarnessApp(M1.seed);
    const outcome = await runAgentMission({ app, userMessage: M1.userMessage, autonomousWrite: true });

    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, M1.expect.toolSequence!);
    for (const f of M1.expect.vaultFiles!) assertVaultFileContains(app, f.path, f.contains);
    assertWithinBudget(outcome, M1.budget!);
  });
});
```

- [ ] **Step 2: Run → PASS.** `npx jest tests/missions/agent/m1-read-write.mission.test.ts`. (3 tool turns + final = `steps` should be 3, within budget.)
- [ ] **Step 3: Commit** `git add` the file; `git commit -m "test: M1 mission (read then autonomous write summary)"`

---

## Task 3: M4 — batch rewrite of 3 notes (large multi-step flagship)

**Files:** Create `tests/missions/agent/m4-batch-rewrite.mission.test.ts`

- [ ] **Step 1: Write the mission test** — agent reads/rewrites 3 notes autonomously (the large-task efficiency & reliability flagship).

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertVaultFileContains, assertWithinBudget, type MissionDefinition } from '../../harness/mission-types';

const NOTES = ['n1.md', 'n2.md', 'n3.md'];

const M4: MissionDefinition = {
  name: 'M4 batch-rewrite-three-notes',
  userMessage: 'Prefix every note with "REVIEWED: ". Do it autonomously without confirmation.',
  seed: { 'n1.md': 'alpha', 'n2.md': 'beta', 'n3.md': 'gamma' },
  autonomousWrite: true,
  trajectory: [
    { type: 'tool', name: 'write_file', args: { path: 'n1.md', content: 'REVIEWED: alpha' } },
    { type: 'tool', name: 'write_file', args: { path: 'n2.md', content: 'REVIEWED: beta' } },
    { type: 'tool', name: 'write_file', args: { path: 'n3.md', content: 'REVIEWED: gamma' } },
    { type: 'final', text: 'Reviewed all three notes.' },
  ],
  expect: {
    toolSequence: ['write_file', 'write_file', 'write_file'],
    vaultFiles: NOTES.map((p) => ({ path: p, contains: 'REVIEWED: ' })),
  },
  budget: { steps: 4 },
};

describe(M4.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('rewrites all three notes within the step budget (efficiency + reliability)', async () => {
    for (const t of M4.trajectory) {
      if (t.type === 'tool') await mockLLM.toolCall(t.name, t.args);
      else await mockLLM.replyWith(t.text);
    }
    const app = createHarnessApp(M4.seed);
    const outcome = await runAgentMission({ app, userMessage: M4.userMessage, autonomousWrite: true });

    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, M4.expect.toolSequence!);
    for (const f of M4.expect.vaultFiles!) assertVaultFileContains(app, f.path, f.contains);
    expect(outcome.toolCallCount).toBe(3);
    assertWithinBudget(outcome, M4.budget!); // 3 writes + 1 final = 4 turns
  });
});
```

- [ ] **Step 2: Run → PASS.** Confirm all three files rewritten and `steps === 4`.
- [ ] **Step 3: Commit** `git commit -m "test: M4 mission (large multi-step batch rewrite)"`

---

## Task 4: M5 — permission isolation

**Files:** Create `tests/missions/agent/m5-permission-isolation.mission.test.ts`

- [ ] **Step 1: Write the test** — agent granted only `read_file`; the scripted LLM tries `write_file`; assert it's denied ("not enabled"), the real write never happens (no file), and the agent still completes without error.

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M5 permission-isolation', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('denies a tool outside the agent allowlist and never executes the real tool', async () => {
    await mockLLM.toolCall('write_file', { path: 'forbidden.md', content: 'X' });
    await mockLLM.replyWith('I am not allowed to write.');
    const app = createHarnessApp({ 'readable.md': 'ok' });

    const outcome = await runAgentMission({
      app,
      userMessage: 'Write forbidden.md.',
      autonomousWrite: true, // even with autonomy, a disallowed tool must not run
      toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:read_file'] } },
    });

    expect(outcome.error).toBeUndefined();
    const wf = outcome.toolResults.find((r) => r.toolName === 'write_file');
    expect(wf).toBeDefined();
    expect(wf!.success).toBe(false);
    expect(wf!.output).toMatch(/not enabled/i);
    expect(await app.vault.adapter.exists('forbidden.md')).toBe(false);
  });
});
```

- [ ] **Step 2: Run → PASS.** The key assertion is `forbidden.md` does NOT exist (real tool never ran) even with `autonomousWrite: true`.
- [ ] **Step 3: Commit** `git commit -m "test: M5 mission (tool permission isolation)"`

---

## Task 5: M6 — max-steps budget halt

**Files:** Create `tests/missions/agent/m6-max-steps.mission.test.ts`

- [ ] **Step 1: Write the test** — agent `maxSteps: 2`; queue more tool calls than the budget; assert the run halts gracefully (`onComplete`, no error) with the budget message, and did NOT execute all queued calls. The runner needs to set the agent's `maxSteps`; pass it via a new `maxSteps` field if not already supported — if `RunMissionInput` lacks `maxSteps`, add it in Task 1 (wire into `createTestAgent({ maxSteps })`). NOTE: add `maxSteps?: number` to `RunMissionInput` and the agent override in Task 1 Step 6 as well.

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M6 max-steps-budget', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('halts gracefully when the step budget is exhausted', async () => {
    // Queue 5 read calls but the budget is small.
    for (let i = 0; i < 5; i++) await mockLLM.toolCall('read_file', { path: 'loop.md' });
    await mockLLM.replyWith('done'); // may never be reached
    const app = createHarnessApp({ 'loop.md': 'content' });

    const outcome = await runAgentMission({
      app, userMessage: 'Keep reading loop.md.', maxSteps: 2,
    });

    expect(outcome.error).toBeUndefined();
    // Graceful budget stop: final message mentions the step budget, and not all 5 calls ran.
    expect(outcome.finalMessage?.content ?? '').toMatch(/step budget/i);
    expect(outcome.toolCallCount).toBeLessThan(5);
  });
});
```

- [ ] **Step 2: Run → PASS.** If the budget message wording differs, match the REAL string from `agent-engine-loop.ts:150-161` (`"Reached the agent step budget of N"`). Adjust the regex to the real text; do not weaken the "fewer than 5 calls" assertion.
- [ ] **Step 3: Commit** `git commit -m "test: M6 mission (max-steps budget halt)"`

---

## Task 6: M7 — tool error recovery

**Files:** Create `tests/missions/agent/m7-tool-error-recovery.mission.test.ts`

- [ ] **Step 1: Write the test** — agent reads a MISSING file (real `success:false`), the error is fed back, then the agent reads an existing file and finishes. Assert the failed result is observed AND the agent recovered (final message, no error).

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M7 tool-error-recovery', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('surfaces a tool failure and lets the agent recover on the next turn', async () => {
    await mockLLM.toolCall('read_file', { path: 'missing.md' }); // real failure
    await mockLLM.toolCall('read_file', { path: 'exists.md' });  // recovery
    await mockLLM.replyWith('Recovered and read exists.md: RECOVER_OK.');
    const app = createHarnessApp({ 'exists.md': 'RECOVER_OK' });

    const outcome = await runAgentMission({ app, userMessage: 'Read missing.md, then recover.' });

    expect(outcome.error).toBeUndefined();
    const failed = outcome.toolResults.find((r) => r.toolName === 'read_file' && !r.success);
    expect(failed).toBeDefined();
    expect(failed!.output).toMatch(/failed|not found/i);
    expect(outcome.finalMessage?.content).toContain('RECOVER_OK');
    expect(outcome.toolCallCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run → PASS.** Confirms the failure branch (`onToolResult(false)`) fires and the agent continues. (Single failure < the 3-consecutive-failure fatal threshold, so the run is not aborted.)
- [ ] **Step 3: Commit** `git commit -m "test: M7 mission (tool error recovery)"`

---

## Task 7: M8 — stop / abort mid-task

**Files:** Create `tests/missions/agent/m8-stop.mission.test.ts`

- [ ] **Step 1: Write the test** — a 3-step trajectory aborted after the first tool call; assert clean stop (no error), only 1 tool executed, and the later writes never happened.

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M8 stop-mid-task', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('aborts cleanly after the first tool call and skips the rest', async () => {
    await mockLLM.toolCall('write_file', { path: 'first.md', content: 'one' });
    await mockLLM.toolCall('write_file', { path: 'second.md', content: 'two' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({});

    const outcome = await runAgentMission({
      app, userMessage: 'Write first then second.', autonomousWrite: true, abortAfterToolCalls: 1,
    });

    expect(outcome.error).toBeUndefined();   // aborted is graceful, not an error
    expect(outcome.toolCallCount).toBe(1);
    expect(await app.vault.adapter.exists('second.md')).toBe(false);
  });
});
```

- [ ] **Step 2: Run → PASS.** Confirms `checkAbort` halts the loop after the first tool, `second.md` never written.
- [ ] **Step 3: Commit** `git commit -m "test: M8 mission (stop/abort mid-task)"`

---

## Task 8: M2 — RAG context injection

**Files:** Create `tests/missions/agent/m2-rag-injection.mission.test.ts`

- [ ] **Step 1: Write the test** — seeded RAG context must reach the LLM request when `enableRAG` is on.

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';

describe('M2 rag-injection', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('feeds retrieved RAG context into the agent LLM request', async () => {
    await mockLLM.replyWith('Based on the knowledge base, the answer is 42.');
    const app = createHarnessApp({});

    const outcome = await runAgentMission({
      app,
      userMessage: 'What is the answer according to my notes?',
      enableRAG: true,
      ragResults: [{ path: 'kb.md', content: 'The answer is 42. RAG_INJECTED_SENTINEL', title: 'KB' }],
    });

    expect(outcome.error).toBeUndefined();
    const calls = await mockLLM.getCalls();
    const firstChat = calls.find((c) => c.path === '/v1/chat/completions');
    expect(JSON.stringify(firstChat?.body)).toContain('RAG_INJECTED_SENTINEL');
  });
});
```

- [ ] **Step 2: Run → PASS.** Confirms the fake RAG content is formatted into the system context and sent to the model.
- [ ] **Step 3: Commit** `git commit -m "test: M2 mission (RAG context injection)"`

---

## Task 9: Non-builtin tool source mission

**Files:** Create `tests/missions/agent/m-ext-tool-source.mission.test.ts`

- [ ] **Step 1: Write the test** — agent calls a tool from an injected non-builtin (`mcp:fake`) source.

```typescript
import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { createFakeToolSource } from '../../harness/fake-tool-source';

describe('M-ext non-builtin-tool-source', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('discovers and invokes a tool from an injected non-builtin source', async () => {
    await mockLLM.toolCall('fake_echo', { text: 'NONBUILTIN_OK' });
    await mockLLM.replyWith('Echoed.');
    const app = createHarnessApp({});

    const outcome = await runAgentMission({
      app,
      userMessage: 'Echo NONBUILTIN_OK.',
      extraToolSources: [createFakeToolSource()],
      toolAccess: { sources: { 'builtin:builtin': 'all', 'mcp:fake': 'all' } },
    });

    expect(outcome.error).toBeUndefined();
    const echo = outcome.toolResults.find((r) => r.toolName === 'fake_echo');
    expect(echo?.success).toBe(true);
    expect(echo?.output).toContain('NONBUILTIN_OK');
  });
});
```

- [ ] **Step 2: Run → PASS.**
- [ ] **Step 3: Commit** `git commit -m "test: non-builtin tool source mission"`

---

## Task 10: Coverage manifest + meta-test

**Files:** Create `tests/missions/coverage-manifest.ts` and `tests/missions/coverage-manifest.test.ts`

- [ ] **Step 1: Write the manifest** mapping each agent capability to its mission file.

`tests/missions/coverage-manifest.ts`:
```typescript
/**
 * Capability -> mission file map. The meta-test asserts every listed mission
 * file exists. Adding a new agent capability without a mission (or renaming a
 * mission file) turns CI red — completeness is enforced, not assumed.
 */
export const COVERAGE_MANIFEST: Record<string, string> = {
  'read+autonomous-write': 'tests/missions/agent/m1-read-write.mission.test.ts',
  'large-multi-step-task': 'tests/missions/agent/m4-batch-rewrite.mission.test.ts',
  'permission-isolation': 'tests/missions/agent/m5-permission-isolation.mission.test.ts',
  'max-steps-budget': 'tests/missions/agent/m6-max-steps.mission.test.ts',
  'tool-error-recovery': 'tests/missions/agent/m7-tool-error-recovery.mission.test.ts',
  'stop-abort': 'tests/missions/agent/m8-stop.mission.test.ts',
  'rag-injection': 'tests/missions/agent/m2-rag-injection.mission.test.ts',
  'non-builtin-tool-source': 'tests/missions/agent/m-ext-tool-source.mission.test.ts',
};
```

- [ ] **Step 2: Write the meta-test**

`tests/missions/coverage-manifest.test.ts`:
```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { COVERAGE_MANIFEST } from './coverage-manifest';

const REPO_ROOT = path.resolve(__dirname, '../..');

describe('mission coverage manifest', () => {
  it('every declared capability maps to an existing mission file', () => {
    const missing = Object.entries(COVERAGE_MANIFEST)
      .filter(([, file]) => !fs.existsSync(path.join(REPO_ROOT, file)))
      .map(([cap, file]) => `${cap} -> ${file}`);
    expect(missing).toEqual([]);
  });

  it('covers the core agent reliability capabilities', () => {
    const required = [
      'permission-isolation', 'max-steps-budget', 'tool-error-recovery',
      'stop-abort', 'large-multi-step-task',
    ];
    const covered = Object.keys(COVERAGE_MANIFEST);
    expect(required.every((c) => covered.includes(c))).toBe(true);
  });
});
```

- [ ] **Step 3: Run → PASS.** `npx jest tests/missions/coverage-manifest.test.ts`. Then run the whole mission suite `npm run test:missions` and confirm all missions green.
- [ ] **Step 4: Verify and commit**

Run `npm test`, `npm run lint`, `npm run build`, `node scripts/deploy.js --local`.
```bash
git add tests/missions/coverage-manifest.ts tests/missions/coverage-manifest.test.ts
git commit -m "test: add mission coverage manifest + completeness meta-test"
```

---

## Definition of Done

- `npm run test:missions` green, now including the M1–M8/M2/M-ext agent missions + the extension tests + coverage manifest.
- Each reliability capability is proven against REAL orchestration: permission isolation (real tool never runs), max-steps (graceful budget halt), tool-error recovery (real failure fed back), stop (clean abort), large multi-step task (flagship), RAG injection, non-builtin tool source.
- Coverage manifest enforces that the core capabilities all have missions.
- `npm test` full suite still green; no WDIO specs leak into jest.

## Self-Review Notes

- **Spec coverage:** Implements spec §6 mission library (M1, M2, M4, M5, M6, M7, M8, non-builtin source) + §6 coverage manifest. M3 (real MCP subprocess), M9 (persistence/resume deep test), and M10 (OpenAPI/CLI real sources) are intentionally represented by the deterministic `mcp:fake` source mission here and deferred as real-integration items to Plan 5 (which wires CI + can run a real MCP subprocess). RAG/embedding throughput perf is Plan 4.
- **Runner extension note:** Task 1 must also add `maxSteps?: number` to `RunMissionInput` (used by Task 5/M6) and wire it into `createTestAgent({ maxSteps })`. This is called out in Task 5 Step 1.
- **Type consistency:** All missions use `runAgentMission(RunMissionInput)` and the `MissionOutcome` fields (`toolResults[].success/output`, `toolCallCount`, `finalMessage`, `steps`, `error`) defined in Plan 1; the oracle helpers (`assertToolSequence`/`assertVaultFileContains`/`assertWithinBudget`) are unchanged.
