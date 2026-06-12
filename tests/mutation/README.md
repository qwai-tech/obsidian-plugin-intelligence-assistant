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

### Break threshold

`thresholds.break = 40`. Set just below the achieved 42.39 % so the gate is
**green** on this baseline (Stryker exits 0 when score >= break) but fails on any
regression that kills fewer mutants. As survivors are killed by future tests,
raise this floor. (`high: 80`, `low: 50` only affect report colouring.)

## Survivor triage

53 mutants survive. They cluster into a few real test gaps — none are believed
equivalent/untestable; the scoped suite simply does not assert on these paths
strongly enough yet. **No tests were added in this change — documentation only.**

| Lines           | Area                                              | Classification | Notes |
| --------------- | ------------------------------------------------- | -------------- | ----- |
| 28–41           | `autoApplyProposal` (batch + single write-apply)  | (a) real gap   | `agent-autonomous-write.test.ts` asserts `vault.create` was called and that a result message contains `applied`, but does not pin the `status`/`operation`/`path` fields or the exact message text, nor the delete-skip guard, the batch path, or the catch/fallback. String, object-literal, conditional and equality mutants here all survive. |
| 56:59           | `requiredScopes: []` array                        | (a) real gap   | No assertion observes `requiredScopes`; emptying it is undetectable by the scoped suite. |
| 64, 102 (schema)| `inputSchema` fallback `?? { type:'object', ... }`| (a) real gap   | Tests don't assert the generated input schema, so the fallback default and its optional-chaining/logical mutants survive. |
| 68, 106 (`context?.action?.reasoning`) | reasoning extraction         | (a) real gap (low value) | No test drives a `context` without `action`; the optional-chaining mutants survive. Cheap to kill with one explicit case. |
| 69:57, 108, 109 (`'act'` phase literal) | callback phase argument     | (a) real gap   | No test asserts the phase string passed to `onToolCall`/`onToolResult`, so replacing `'act'` with `""` survives. |
| 77 (`applied !== null`) | auto-apply result substitution           | (a) real gap   | The substitution branch isn't asserted distinctly from the non-substituted path. |
| 84:70 (failure message) | failure-output string                    | (a) real gap   | m7 asserts a failure occurs but not the exact `Tool "x" failed: ...` text. |
| 86 / 88 (`+ 1`, `>=`, counter)| consecutive-failure circuit breaker      | (a) real gap (boundary) | m7 exercises recovery but does not assert the exact failure count or the `>= MAX_CONSECUTIVE_FAILURES` boundary, so the arithmetic/equality/block mutants survive. |
| 117–121 (`toKernelSideEffectLevel`) | write-vs-read classification     | (a) real gap   | No mission/unit test asserts the side-effect level assigned to a registered tool, so the whole function (block, conditionals, logical-OR, both return literals) survives. High-value to cover: this drives the permission model. |

All survivors are **category (a) real test gaps**, addressed in a later plan
(do not add tests here).

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
