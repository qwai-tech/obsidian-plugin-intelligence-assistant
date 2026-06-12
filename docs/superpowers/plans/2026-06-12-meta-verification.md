# Meta-Verification: Flake-Soak + Mutation Testing (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Prove the test suite itself is trustworthy — **reliable** (flake-soak: the deterministic mission suite passes identically across many runs) and **effective** (mutation testing: deliberately breaking the agent orchestration makes the suite go red). These are the spec's §3 mechanisms for the "Accurate / Effective / Reliable / Verifiable" axioms.

**Architecture:** (1) A `flake-soak` node script that runs the harness+mission suite N times and fails on any non-identical outcome. (2) Stryker mutation testing scoped to the agent orchestration core, run serially (concurrency 1, because the mock LLM server binds a fixed port), with the agent unit tests + mission suite as the killing test command, and a mutation-score threshold gate.

**Tech Stack:** node, jest, `@stryker-mutator/core` + `@stryker-mutator/jest-runner`.

**Reference (spec):** `docs/superpowers/specs/2026-06-12-agent-centric-e2e-design.md` §3.

**Constraint (verified):** the mock LLM server binds a fixed port (`DEFAULT_MOCK_LLM_PORT`), and jest already runs `maxWorkers: 1`. Stryker's parallel runners would collide on that port, so Stryker MUST use `concurrency: 1`. To keep the gate fast, the initial mutation `mutate` glob is scoped to the single highest-kill-power orchestration file (`kernel-tool-registry-adapter.ts` — tool dispatch + permission deny + autonomous-apply), with the glob easy to widen later.

---

## Task 1: Flake-soak script (reliability proof)

**Files:**
- Create: `scripts/flake-soak.js`
- Modify: `package.json` (add `test:flake-soak`)
- Test: manual run

- [ ] **Step 1: Write `scripts/flake-soak.js`**

A script that runs the harness+mission jest suite N times (default 20, override via `FLAKE_SOAK_RUNS`) and fails if any run's pass/fail tally differs from the first (or any run fails). Uses `child_process.execFileSync` to invoke jest with `--json`.

```javascript
#!/usr/bin/env node
/**
 * Flake-soak: run the deterministic harness+mission suite N times and require
 * IDENTICAL results every time. Any variation (a flake) or any failure exits 1.
 * Proves the gating layer is deterministic — the spec's "reliable" axiom.
 */
const { execFileSync } = require('node:child_process');

const RUNS = Number(process.env.FLAKE_SOAK_RUNS || 20);
const JEST = require.resolve('jest/bin/jest.js');
const ARGS = ['tests/harness', 'tests/missions', '--json', '--silent'];

function runOnce(i) {
  let raw;
  try {
    raw = execFileSync(process.execPath, [JEST, ...ARGS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // jest exits non-zero on failure; still emits JSON on stdout
    raw = err.stdout ? err.stdout.toString() : '';
  }
  const start = raw.indexOf('{');
  if (start < 0) throw new Error(`Run ${i}: no JSON output from jest`);
  const result = JSON.parse(raw.slice(start));
  return {
    success: result.success,
    numPassedTests: result.numPassedTests,
    numFailedTests: result.numFailedTests,
    numTotalTests: result.numTotalTests,
  };
}

function main() {
  console.log(`Flake-soak: ${RUNS} runs of the harness+mission suite...`);
  const baseline = runOnce(1);
  console.log(`Run 1: ${JSON.stringify(baseline)}`);
  if (!baseline.success) {
    console.error('FLAKE-SOAK FAILED: baseline run did not pass.');
    process.exit(1);
  }
  for (let i = 2; i <= RUNS; i++) {
    const r = runOnce(i);
    const same = r.success === baseline.success
      && r.numPassedTests === baseline.numPassedTests
      && r.numFailedTests === baseline.numFailedTests
      && r.numTotalTests === baseline.numTotalTests;
    if (!same) {
      console.error(`FLAKE DETECTED on run ${i}: ${JSON.stringify(r)} != baseline ${JSON.stringify(baseline)}`);
      process.exit(1);
    }
    if (i % 5 === 0) console.log(`Run ${i}: stable (${r.numPassedTests} passed)`);
  }
  console.log(`Flake-soak PASSED: ${RUNS}/${RUNS} runs identical (${baseline.numPassedTests} passed each).`);
}

main();
```

- [ ] **Step 2: Add npm script** to `package.json` after `test:missions`:
```json
"test:flake-soak": "node scripts/flake-soak.js",
```

- [ ] **Step 3: Run it** with a small count first to verify, then the default:

Run: `FLAKE_SOAK_RUNS=5 npm run test:flake-soak`
Expected: `Flake-soak PASSED: 5/5 runs identical`.
Run: `npm run test:flake-soak`
Expected: `Flake-soak PASSED: 20/20 runs identical`.
If a flake appears, that is a REAL finding — investigate the non-determinism (do not just lower the run count). Report it.

- [ ] **Step 4: Commit**
```bash
git add scripts/flake-soak.js package.json
git commit -m "test: add flake-soak determinism gate for the mission suite"
```

---

## Task 2: Stryker mutation testing (effectiveness proof)

**Files:**
- Modify: `package.json` (devDeps + `test:mutation` script)
- Create: `stryker.config.json`
- Create: `tests/mutation/README.md` (documents scope + how to widen)

- [ ] **Step 1: Install Stryker dev dependencies**

Run:
```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner
```
Confirm versions land in `package.json` devDependencies. (Stryker 9.x, jest-runner matching.)

- [ ] **Step 2: Create `stryker.config.json`**

Scope mutation to the single highest-kill-power orchestration file initially; serial concurrency for the fixed-port mock server. The test command is a focused jest config run that includes the agent unit tests + the mission suite (strong mutant killers).

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "jest",
  "jest": {
    "projectType": "custom",
    "configFile": "jest.config.js"
  },
  "concurrency": 1,
  "timeoutMS": 60000,
  "coverageAnalysis": "off",
  "mutate": [
    "src/application/agents/kernel/kernel-tool-registry-adapter.ts"
  ],
  "thresholds": {
    "high": 90,
    "low": 80,
    "break": 70
  },
  "tempDirName": ".stryker-tmp",
  "reporters": ["clear-text", "progress", "json"],
  "jsonReporter": {
    "fileName": "tests/mutation/mutation-report.json"
  }
}
```
Notes for the implementer:
- `coverageAnalysis: "off"` avoids Stryker's per-test coverage instrumentation (which can be fragile with ts-jest + jsdom); every mutant runs the full focused command. Simpler and robust for a first baseline.
- If the jest runner picks up ALL tests (slow), narrow it by adding a Stryker jest `config` override or a dedicated jest config that only runs `src/__tests__/application/agents` + `tests/harness` + `tests/missions`. Prefer creating `jest.mutation.config.js` (extends the base, sets `roots`/`testMatch` to those dirs) and point `jest.configFile` at it, so each mutant only runs the orchestration-relevant tests — much faster.
- Keep `concurrency: 1` (fixed mock-LLM port).

- [ ] **Step 3: (Recommended) create `jest.mutation.config.js`** to scope the killing tests

```javascript
const base = require('./jest.config');
module.exports = {
  ...base,
  roots: ['<rootDir>/src/__tests__/application/agents', '<rootDir>/tests/harness', '<rootDir>/tests/missions'],
};
```
Point `stryker.config.json` `jest.configFile` at `jest.mutation.config.js`. Confirm `npx jest --config jest.mutation.config.js` runs only those suites and is green before running Stryker.

- [ ] **Step 4: Add npm script** to `package.json`:
```json
"test:mutation": "stryker run",
```

- [ ] **Step 5: Run the mutation baseline**

Run: `npm run test:mutation`
Capture the reported **mutation score**. This may take several minutes (serial). Expected: a high score on this file (the missions + unit tests exercise dispatch, permission-deny, and autonomous-apply heavily). If the score is below the `break: 70` threshold, Stryker exits non-zero — in that case, look at the SURVIVED mutants in `tests/mutation/mutation-report.json`: each surviving mutant is a real gap where the orchestration could break without a test noticing. For each survivor, either (a) it's a meaningful gap → note it (a follow-up mission/unit test should kill it), or (b) it's equivalent/untestable → acceptable. Set `break` to a realistic floor at/just below the achieved score so the gate is meaningful but green on this baseline. Report the exact score and any notable survivors.

- [ ] **Step 6: Create `tests/mutation/README.md`**

Document: what's mutated (scope), why concurrency is 1 (fixed port), the current score + threshold, how to widen the `mutate` glob (add more `src/application/agents/**` files), and the survivor-triage policy. Add `.stryker-tmp/` and `tests/mutation/mutation-report.json` to `.gitignore` (keep the README + config tracked).

- [ ] **Step 7: Verify + commit**

Run `npm test` (full suite still green — confirm the new devDeps/config didn't disturb it). `npm run lint`, `npm run build`.
```bash
git add package.json package-lock.json stryker.config.json jest.mutation.config.js tests/mutation/README.md .gitignore
git commit -m "test: add Stryker mutation gate scoped to agent orchestration core"
```

---

## Definition of Done

- `npm run test:flake-soak` proves the mission suite is deterministic across 20 runs.
- `npm run test:mutation` runs Stryker over the orchestration core and reports a mutation score; the `break` threshold is set to a meaningful floor that the current suite clears. Surviving mutants (if any) are triaged/noted.
- `tests/mutation/README.md` documents scope, the concurrency constraint, the score, and how to widen.
- `npm test` full suite still green.

## Self-Review Notes

- **Spec coverage:** Implements §3 "Reliable" (flake-soak) and "Effective" (mutation testing) meta-verification. The spec's "every PR blocking" cadence + widening the mutation glob to the full `src/application/agents/**` is wired into Plan 5 (CI), where the gate jobs are defined; this plan establishes the working mechanism + baseline on the highest-value file so the gate is real and fast first.
- **Constraint honored:** concurrency 1 for the fixed-port mock server; flake-soak and mutation both run under the existing `maxWorkers: 1` jest config.
- **Realism:** the initial mutation scope is one file to get a fast, green, real baseline; widening is a documented one-line glob change, deferred to CI wiring (Plan 5) so the PR-gate runtime can be tuned there.
