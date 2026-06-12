# Mutation Testing (Stryker)

This directory holds the mutation-testing gate that proves the agent mission +
unit suites actually **kill** mutations in the orchestration core — the
"effective" axiom of meta-verification. A test suite that passes but lets
mutants survive is not actually verifying behaviour; mutation testing measures
that.

## Scope

Currently a single, high-kill-power file is mutated:

```
src/application/agents/kernel/kernel-tool-registry-adapter.ts
```

This adapter is the busiest orchestration seam: tool dispatch, the
permission-deny path (disabled native tools), the autonomous write-apply path,
the consecutive-failure circuit-breaker, and side-effect-level classification.
It is exercised by the mission suite (`tests/missions/`) and the agent unit
tests (`src/__tests__/application/agents/`).

## Why `concurrency: 1`

The mission harness (`tests/harness/mock-llm-harness.ts`) starts a mock LLM
server bound to a **fixed port** (`DEFAULT_MOCK_LLM_PORT` from
`tests/e2e/support/mock-llm-server.ts`). The base Jest config runs
`maxWorkers: 1` for the same reason. If Stryker ran multiple test-runner
processes in parallel, each would try to bind the same port and collide.
Therefore `stryker.config.json` sets `"concurrency": 1`. Do not raise it without
first making the mock server pick a free port per worker.

## Configuration notes

- `jest.mutation.config.js` narrows Jest `roots` to the three
  orchestration-relevant dirs so each mutant runs only the killing suites
  (26 suites / 65 tests, ~2s standalone) instead of the whole repo.
- `jest.enableFindRelatedTests: false` — with `coverageAnalysis: "off"`,
  Stryker's Jest runner otherwise uses `--findRelatedTests`, which resolves to
  zero tests for this file in the sandbox and aborts the dry run. Disabling it
  runs the full scoped suite against every mutant.
- `ignorePatterns` excludes `.obsidian-cache` (a macOS Electron framework copy
  that contains symlinks Stryker cannot `copyfile` into its sandbox — fails with
  `ENOTSUP`), plus `coverage`, `tmp`, and `docs` to keep the sandbox copy fast.
  `tests/e2e` must **not** be ignored because the mission harness imports the
  mock LLM server from `tests/e2e/support/`.
- `coverageAnalysis: "off"` avoids per-test coverage instrumentation issues with
  ts-jest.

## Baseline result (2026-06-12)

Stryker v9.6.1 (`@stryker-mutator/core` + `@stryker-mutator/jest-runner`).

| Metric          | Value          |
| --------------- | -------------- |
| Mutants total   | 92             |
| Killed          | 39             |
| Survived        | 53             |
| Timeout         | 0              |
| No coverage     | 0              |
| Runtime errors  | 0              |
| **Score**       | **42.39 %**    |

Runs serially in ~4 minutes.

## Current result (2026-06-13)

Added a focused unit suite,
`src/__tests__/application/agents/kernel/kernel-tool-registry-adapter.test.ts`
(28 tests), targeting the high-value survivor clusters: side-effect
classification, the registered-tool definition fields, the success/failure
callback phases, the failure message + consecutive-failure circuit-breaker
boundary, the disabled-tool deny-stub, the autonomous write auto-apply
(single/batch/delete-skip/catch-fallback), and the reasoning optional-chaining.

| Metric          | Value          |
| --------------- | -------------- |
| Mutants total   | 92             |
| Killed          | 87             |
| Survived        | 5              |
| Timeout         | 0              |
| No coverage     | 0              |
| Runtime errors  | 0              |
| **Score**       | **94.57 %**    |

### Break threshold

`thresholds.break = 90` (raised from 40). Set just below the achieved 94.57 % so
the gate stays **green** (Stryker exits 0 when score >= break) while the 5
remaining survivors — all equivalent mutants (below) — keep it off 100 %. Any
regression that kills fewer than ~83/92 mutants now fails the gate.
(`high: 90`, `low: 70` only affect report colouring.)

## Survivor triage

**5 survivors remain, all equivalent mutants** — no test can distinguish them
without changing production behaviour.

| Lines        | Mutant(s)                                              | Classification | Why it survives |
| ------------ | ------------------------------------------------------ | -------------- | --------------- |
| 33           | `if (isWriteProposal(value))` → `if (true)`            | (b) equivalent | Reached only after the batch branch returns; for any single write proposal the guard is already true, and a non-proposal value reaches this line only when the batch branch was false — but the function returns `null` either way after both branches, so forcing `true` changes nothing observable for the inputs that get here. |
| 34           | `value.operation === 'delete'` → `if (false)`          | (b) equivalent | `isWriteProposal` (write-proposal-service) only returns true for `create`/`update`/`append` — **never** `delete`. So inside this block `operation === 'delete'` is *always false*; the early `return null` is dead code. |
| 34           | `value.operation === 'delete'` → `=== ""`              | (b) equivalent | Same dead branch: no single write proposal has operation `''` either, so both comparisons are always false here. |
| 38           | catch `BlockStatement` → `{}`                          | (b) equivalent | The catch body is a diagnostic `console.error` only; control flow falls through to `return null` regardless, so emptying the block has no observable effect. |
| 39           | `console.error('[AutoApply] …')` → `console.error("")` | (b) equivalent | Log-string-only mutant; the message text is never asserted (and asserting console output would be a brittle anti-test). |

### Killed this change (previously-surviving clusters now covered)

- `toKernelSideEffectLevel` (117–121) — write/externalWrite → `write`, else
  `read`; all conditional/logical/return-literal mutants killed by asserting
  `registry.get(name).sideEffectLevel`.
- `requiredScopes: []` (66), `inputSchema` fallback (64/102), tool `description`
  (63) — asserted on the registered tool definition.
- `'act'` phase literals (69/80/108/109) — asserted as the exact 4th arg to
  `onToolCall`/`onToolResult` on both the success and deny paths.
- Failure message (84) + `Unknown error` fallback, counter `+ 1` (86) and the
  `>= MAX_CONSECUTIVE_FAILURES` boundary (88) — boundary tests at 2 (no
  `fatalStopReason`) and exactly 3 (set) failures.
- Disabled-tool deny-stub (95–113) — exact `Tool "X" is not enabled for this
  agent` message + `success=false` + `'act'` phase, and the deny-stub schema
  fallback.
- `autoApplyProposal` (28–41) — exact single-create applied record
  (`status`/`operation`/`path`/`message`), batch applied record, delete-skip
  guard (batch with a delete → original proposal passes through), catch fallback
  (apply throws → manual proposal), and the `applied !== null` substitution
  branch (asserted via the serialized `onToolResult` output).
- `context?.action?.reasoning` (68/106) — covered with context undefined and
  context defined-but-action-undefined, killing both optional-chaining mutants.

## Widening the mutate glob later

To mutate more of the orchestration core, broaden `mutate` in
`stryker.config.json`, e.g.:

```json
"mutate": [
  "src/application/agents/**/*.ts",
  "!src/application/agents/**/*.test.ts"
]
```

This proportionally increases runtime (every added mutant re-runs the full
scoped suite serially because `concurrency: 1`). Tune the scope/runtime tradeoff
in CI (Plan 5) — e.g. mutate the full `agents/**` tree on a nightly job while
keeping this single-file gate on every PR.

## Running

```bash
npm run test:mutation        # stryker run
```

Outputs a clear-text table and writes `tests/mutation/mutation-report.json`
(gitignored). The `.stryker-tmp/` sandbox is also gitignored.
