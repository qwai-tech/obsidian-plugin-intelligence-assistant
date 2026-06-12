# Performance & Efficiency Suite (Plan 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Add a performance layer that catches regressions reliably. The blocking gate measures **agent efficiency in deterministic units** (LLM turns and tool calls per fixed mission) against committed baselines — the most agentic perf dimension and 100% flake-free. Wall-clock timings and memory are handled as a **gross-leak guard with generous bounds** plus **non-blocking recorded metrics**, because noisy timing must never become a flaky gate.

**Architecture:** Reuse `runAgentMission`. A committed `efficiency.baseline.json` pins each scenario's exact `steps`/`toolCallCount`; the gate asserts equality (any orchestration regression that adds an LLM turn or tool call goes red). A separate memory test runs a mission many times under forced GC and fails only on gross unbounded heap growth. Wall-clock load/latency is measured and written to a gitignored report, printed but not gated.

**Tech Stack:** node, jest, the `tests/harness/` foundation.

**Reference (spec):** `docs/superpowers/specs/2026-06-12-agent-centric-e2e-design.md` §5.

**Design rationale (honest determinism boundary):** §5 lists startup time, plugin-side latency, RAG throughput, memory, and agent efficiency. Of these, only **agent efficiency** (turns/tool-calls) and **request counts** are deterministic in a headless mock run. Wall-clock and heap are environment-noisy; gating on them would reintroduce flakes the flake-soak gate exists to prevent. So efficiency is the blocking gate; the rest are guard-railed/recorded. This is the intellectually honest design, not a shortcut.

---

## Task 1: Deterministic agent-efficiency baseline + gate (blocking)

**Files:**
- Create: `tests/perf/efficiency-scenarios.ts` (shared scenario definitions)
- Create: `tests/perf/efficiency.baseline.json` (committed baselines)
- Create: `tests/perf/efficiency.perf.test.ts`
- Modify: `package.json` (add `test:perf`)

- [ ] **Step 1: Define scenarios** — `tests/perf/efficiency-scenarios.ts`

A scenario = a name + a function that queues a trajectory and runs a mission, returning the outcome. Reuse representative mission shapes (single-tool, multi-step, large batch) so efficiency regressions in orchestration surface.

```typescript
import { createHarnessApp } from '../harness/in-memory-vault';
import { mockLLM } from '../harness/mock-llm-harness';
import { runAgentMission, type MissionOutcome } from '../harness/mission-runner';

export interface EfficiencyMetric { steps: number; toolCalls: number; }

export interface Scenario { name: string; run: () => Promise<MissionOutcome>; }

export const SCENARIOS: Scenario[] = [
  {
    name: 'single-read',
    run: async () => {
      await mockLLM.toolCall('read_file', { path: 'a.md' });
      await mockLLM.replyWith('done');
      const app = createHarnessApp({ 'a.md': 'x' });
      return runAgentMission({ app, userMessage: 'read a' });
    },
  },
  {
    name: 'read-then-write',
    run: async () => {
      await mockLLM.toolCall('read_file', { path: 'a.md' });
      await mockLLM.toolCall('write_file', { path: 'b.md', content: 'y' });
      await mockLLM.replyWith('done');
      const app = createHarnessApp({ 'a.md': 'x' });
      return runAgentMission({ app, userMessage: 'read a then write b autonomously without confirmation', autonomousWrite: true });
    },
  },
  {
    name: 'batch-five-writes',
    run: async () => {
      for (let i = 0; i < 5; i++) await mockLLM.toolCall('write_file', { path: `n${i}.md`, content: `v${i}` });
      await mockLLM.replyWith('done');
      const app = createHarnessApp({});
      return runAgentMission({ app, userMessage: 'write five notes autonomously without confirmation', autonomousWrite: true });
    },
  },
];

export function metric(outcome: MissionOutcome): EfficiencyMetric {
  return { steps: outcome.steps, toolCalls: outcome.toolCallCount };
}
```

- [ ] **Step 2: Write the gate test** — `tests/perf/efficiency.perf.test.ts`

Runs each scenario, compares to the baseline JSON exactly; with `UPDATE_PERF_BASELINE=1` it (re)writes the baseline instead of asserting.

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { startMockLLM, stopMockLLM } from '../harness/mock-llm-harness';
import { SCENARIOS, metric, type EfficiencyMetric } from './efficiency-scenarios';

const BASELINE_PATH = path.join(__dirname, 'efficiency.baseline.json');
const UPDATE = process.env.UPDATE_PERF_BASELINE === '1';

describe('agent efficiency baseline', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  if (UPDATE) {
    it('regenerates the efficiency baseline', async () => {
      const out: Record<string, EfficiencyMetric> = {};
      for (const s of SCENARIOS) {
        await startMockLLM(); // fresh queue per scenario
        const outcome = await s.run();
        expect(outcome.error).toBeUndefined();
        out[s.name] = metric(outcome);
        await stopMockLLM();
      }
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n');
      expect(fs.existsSync(BASELINE_PATH)).toBe(true);
    });
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, EfficiencyMetric>;
  for (const s of SCENARIOS) {
    it(`${s.name} matches its efficiency baseline (turns + tool calls)`, async () => {
      const outcome = await s.run();
      expect(outcome.error).toBeUndefined();
      expect(metric(outcome)).toEqual(baseline[s.name]);
    });
  }
});
```
Note: the `beforeEach`/`afterEach` already start/stop the server; in the UPDATE branch the inner start/stop is redundant — the implementer should reconcile so a single clean server lifecycle per scenario exists (simplest: in UPDATE mode don't use the outer hooks, or clear queue between scenarios). Make it work cleanly; the gate (non-UPDATE) path is what matters.

- [ ] **Step 3: Generate the baseline, then run the gate**

Run: `UPDATE_PERF_BASELINE=1 npx jest tests/perf/efficiency.perf.test.ts` → writes `efficiency.baseline.json`. Inspect it: values should be deterministic (e.g. single-read steps:2 toolCalls:1; read-then-write steps:3 toolCalls:2; batch-five-writes steps:6 toolCalls:5).
Then run: `npx jest tests/perf/efficiency.perf.test.ts` → all scenarios PASS against the committed baseline.

- [ ] **Step 4: Add npm script** `"test:perf": "jest tests/perf",` and commit

```bash
git add tests/perf/efficiency-scenarios.ts tests/perf/efficiency.baseline.json tests/perf/efficiency.perf.test.ts package.json
git commit -m "test: add deterministic agent-efficiency baseline gate"
```

---

## Task 2: Memory-leak guard + non-blocking timing metrics

**Files:**
- Create: `tests/perf/memory.perf.test.ts`
- Create: `tests/perf/timing.perf.test.ts`
- Modify: `package.json` (`test:perf:mem` with `--expose-gc`), `.gitignore`

- [ ] **Step 1: Memory-leak guard** — `tests/perf/memory.perf.test.ts`

Run a mission many times; if `global.gc` is available (node `--expose-gc`), force GC and assert the second-half average heap is not grossly larger than the first-half (generous tolerance to avoid flakes). If `global.gc` is unavailable, record-only (don't hard-fail) and log a note.

```typescript
import { startMockLLM, stopMockLLM, mockLLM } from '../harness/mock-llm-harness';
import { createHarnessApp } from '../harness/in-memory-vault';
import { runAgentMission } from '../harness/mission-runner';

const ITERATIONS = Number(process.env.MEM_ITERATIONS || 40);
// Gross-leak bound: second-half avg heap must stay under 1.5x the first-half avg.
const GROWTH_LIMIT = 1.5;

async function oneMission(): Promise<void> {
  await mockLLM.clearAll();
  await mockLLM.toolCall('read_file', { path: 'a.md' });
  await mockLLM.replyWith('done');
  const app = createHarnessApp({ 'a.md': 'x' });
  const outcome = await runAgentMission({ app, userMessage: 'read a' });
  if (outcome.error) throw outcome.error;
}

describe('memory-leak guard', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('does not grow heap unboundedly across repeated missions', async () => {
    const gc = (global as unknown as { gc?: () => void }).gc;
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      await oneMission();
      if (gc) gc();
      samples.push(process.memoryUsage().heapUsed);
    }
    const half = Math.floor(samples.length / 2);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const firstAvg = avg(samples.slice(0, half));
    const secondAvg = avg(samples.slice(half));
    const ratio = secondAvg / firstAvg;
    // eslint-disable-next-line no-console
    console.log(`[mem] iterations=${ITERATIONS} gc=${Boolean(gc)} firstAvg=${(firstAvg/1e6).toFixed(1)}MB secondAvg=${(secondAvg/1e6).toFixed(1)}MB ratio=${ratio.toFixed(2)}`);
    if (gc) {
      expect(ratio).toBeLessThan(GROWTH_LIMIT);
    } else {
      // No forced GC available; record-only to avoid GC-noise flakes.
      expect(samples.length).toBe(ITERATIONS);
    }
  });
});
```

- [ ] **Step 2: Timing metrics (non-blocking)** — `tests/perf/timing.perf.test.ts`

Measures wall-clock of a representative mission and writes a gitignored report. Asserts only that it completed (no timing threshold — timing is recorded, not gated).

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { startMockLLM, stopMockLLM, mockLLM } from '../harness/mock-llm-harness';
import { createHarnessApp } from '../harness/in-memory-vault';
import { runAgentMission } from '../harness/mission-runner';

describe('timing metrics (non-blocking record)', () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('records wall-clock for a representative mission', async () => {
    await mockLLM.toolCall('read_file', { path: 'a.md' });
    await mockLLM.toolCall('write_file', { path: 'b.md', content: 'y' });
    await mockLLM.replyWith('done');
    const app = createHarnessApp({ 'a.md': 'x' });

    const t0 = process.hrtime.bigint();
    const outcome = await runAgentMission({ app, userMessage: 'read then write autonomously without confirmation', autonomousWrite: true });
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    expect(outcome.error).toBeUndefined();
    const report = { ts: new Date().toISOString(), scenario: 'read-then-write', elapsedMs, steps: outcome.steps, toolCalls: outcome.toolCallCount };
    const out = path.join(__dirname, 'timing-report.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    // eslint-disable-next-line no-console
    console.log(`[timing] ${report.scenario}: ${elapsedMs.toFixed(1)}ms, ${outcome.steps} turns`);
    expect(elapsedMs).toBeGreaterThan(0);
  });
});
```
Note: `new Date().toISOString()` is fine in a normal jest test (the Date restriction applies only to workflow scripts, not jest). If jest's environment forbids it, use `Date.now()`.

- [ ] **Step 3: Scripts + gitignore**

`package.json`: add `"test:perf:mem": "node --expose-gc node_modules/.bin/jest tests/perf/memory.perf.test.ts"` (so forced GC is available for the leak bound).
`.gitignore`: add `tests/perf/timing-report.json`.

- [ ] **Step 4: Run and verify**

Run: `npx jest tests/perf` → efficiency + memory (record-only without gc) + timing all green.
Run: `npm run test:perf:mem` → memory test with forced GC; confirm the ratio is well under 1.5 and it passes. Report the logged ratio.
If the memory ratio is unexpectedly high (>1.5 with GC), that's a possible real leak signal — investigate (re-run; check whether the mock server or harness retains references across iterations). Report findings; do NOT just raise the limit to hide a real leak.

- [ ] **Step 5: Commit**

```bash
git add tests/perf/memory.perf.test.ts tests/perf/timing.perf.test.ts package.json .gitignore
git commit -m "test: add memory-leak guard and non-blocking timing metrics"
```

---

## Definition of Done

- `npm run test:perf` green: deterministic efficiency gate (turns/tool-calls per scenario vs committed baseline) + memory guard + timing record.
- The efficiency gate fails if an orchestration change adds an LLM turn or tool call to any scenario (verified by reasoning / a temporary tweak).
- `npm run test:perf:mem` proves no gross heap growth across repeated missions under forced GC.
- Timing is recorded (gitignored report), not gated.
- `npm test` full suite still green; flake-soak still passes (the perf tests are deterministic except the recorded timing value, which is not asserted).

## Self-Review Notes

- **Spec coverage:** §5 — agent efficiency is the deterministic blocking gate (turns/tool-calls); memory is a gross-leak guard; startup/latency are recorded as non-blocking timing. RAG/indexing throughput is represented structurally (a RAG-enabled scenario could be added to `efficiency-scenarios.ts`); real embedding throughput needs real vectors and is deferred (it's environment-noisy and belongs with the non-blocking metrics).
- **Determinism honored:** the blocking gate uses only deterministic counters; nothing wall-clock or heap-based is a hard gate except the generous gross-leak bound under forced GC. This keeps the flake-soak gate green.
- **Why equality (not a tolerance) on efficiency:** in a headless scripted run the turn/tool counts are exact; a tolerance would hide real orchestration regressions. Equality is the strongest, still-flake-free assertion.
