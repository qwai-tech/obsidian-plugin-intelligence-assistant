# Verification Gate CI + Static-Check Coverage (Plan 5 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Wire all the deterministic gates into CI so a green pipeline — not a human — authorizes release, and bring the new test code under static checking. Currently `pull-request.yml` only runs `npm run build`; nothing runs the unit/mission tests, lint, flake-soak, mutation, or perf on PRs. This plan adds a single fast, deterministic **verification gate** job (no Electron) and extends lint + tsconfig to the harness/mission/perf source.

**Architecture:** A new additive GitHub Actions workflow `verification-gate.yml` on ubuntu running build → lint → full jest suite (L1 unit + L2 missions + perf) → flake-soak → mutation → memory guard. Plus an eslint override + tsconfig coverage for `tests/harness`/`tests/missions`/`tests/perf` source (the `.test.ts` files stay eslint-ignored as today; only the helper `.ts` get linted). The existing `e2e.yml` (WDIO) and `pull-request.yml` are left untouched — this is purely additive.

**Non-goals / deferred (documented, not done — to avoid breaking working CI):**
- Pinning `OBSIDIAN_VERSION` in `e2e.yml` (currently `latest`): recommended to eliminate the non-deterministic Obsidian-version input, but NOT changed here because a guessed pin could break the user's currently-passing E2E. Tracked in `tests/mutation/README.md`/this plan as a recommendation.
- Thinning the 28 WDIO specs to 5–8 critical paths: the existing specs are the maintainer's work; not deleted autonomously.
- jest `projects` split to drop global `maxWorkers: 1`: optional optimization; `maxWorkers: 1` works today.
- Widening the mutation `mutate` glob beyond the one orchestration file: increases PR runtime; tune when desired.

**Reference (spec):** `docs/superpowers/specs/2026-06-12-agent-centric-e2e-design.md` §7 (release contract).

---

## Task 1: Verification gate workflow

**Files:**
- Create: `.github/workflows/verification-gate.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Verification Gate

on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

permissions:
  contents: read

jobs:
  gate:
    name: Deterministic Verification Gate
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Lint
        run: npm run lint

      - name: Unit + mission + perf suite
        run: npm test

      - name: Flake-soak (determinism)
        run: npm run test:flake-soak

      - name: Memory-leak guard (forced GC)
        run: npm run test:perf:mem

      - name: Mutation gate (agent orchestration core)
        run: npm run test:mutation

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: tests/mutation/mutation-report.json
          if-no-files-found: ignore
```

- [ ] **Step 2: Validate the YAML**

Run a YAML lint locally (any of):
```bash
node -e "const fs=require('fs'); const yaml=require('js-yaml'); yaml.load(fs.readFileSync('.github/workflows/verification-gate.yml','utf8')); console.log('YAML OK')" 2>/dev/null \
  || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/verification-gate.yml')); print('YAML OK')"
```
Expected: `YAML OK`. (If `js-yaml` isn't installed and python3 is unavailable, visually verify indentation; the file must parse.)

- [ ] **Step 3: Smoke-run the gate steps locally** (the actual gate is GitHub-side, but prove the commands succeed)

Run each gate command and confirm success (these may take a few minutes for mutation):
```bash
npm run build
npm run lint
npm test
npm run test:flake-soak
npm run test:perf:mem
npm run test:mutation
```
Report each result. If any fails locally, the gate would fail — fix before committing (do not commit a gate that's red on main).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/verification-gate.yml
git commit -m "ci: add deterministic verification gate (tests, flake-soak, mutation, perf)"
```

---

## Task 2: Static-check coverage for harness/mission/perf source

**Files:**
- Modify: `eslint.config.mts` (add an override block for `tests/harness`/`tests/missions`/`tests/perf`)
- Modify: `package.json` (extend the `lint` script glob)
- Modify: `tsconfig.json` (add the new test dirs to `include`; `.test.ts` stays excluded)

- [ ] **Step 1: Extend the lint glob**

In `package.json`, change the `lint` script from:
```
eslint src main.ts tests/e2e --ext .ts
```
to:
```
eslint src main.ts tests/e2e tests/harness tests/missions tests/perf --ext .ts
```
(`tsconfig.test` not required for eslint; the flat config uses `tsconfig.json` for the parser project — see Step 3.)

- [ ] **Step 2: Add an eslint override** for the new test dirs in `eslint.config.mts`

The harness/mission/perf helper `.ts` files (the `.test.ts` are already globally ignored) use deliberate test shims (`as never`, `unknown` stubs, console logging, Node globals). Mirror the existing `tests/e2e/**` relaxation. Add this block to the exported array (after the e2e blocks, before the closing `]`):
```typescript
  // Headless harness / mission / perf helpers: relax strict TS rules that target
  // plugin source. These are Node-side test utilities (deliberate stubs, casts,
  // and console logging), mirroring the tests/e2e relaxation.
  {
    files: ["tests/harness/**/*.ts", "tests/missions/**/*.ts", "tests/perf/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/require-await": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/prefer-window-timers": "off",
      "no-console": "off",
      "no-restricted-globals": "off",
    },
  },
```
Keep the disciplinary rules that DO apply (floating promises, unused vars, no-eval, etc.) ON — only the listed shim-related rules are relaxed.

- [ ] **Step 3: Make the eslint parser project include the new files**

The flat config sets `parserOptions.project: "./tsconfig.json"`. Typed linting requires the files to be in that project. Add the new dirs to `tsconfig.json` `include` (the `exclude` already drops `**/*.test.ts`, so only the helper `.ts` are added):
```jsonc
"include": [
  "main.ts", "src/**/*.ts", "src/**/*.d.ts", "scripts/**/*.ts",
  "__mocks__/**/*.ts", "tests/e2e/**/*.ts",
  "tests/harness/**/*.ts", "tests/missions/**/*.ts", "tests/perf/**/*.ts"
],
```
(The `.test.ts` files remain excluded by the existing `exclude` entry `**/*.test.ts`, so only the helper modules — `in-memory-vault.ts`, `mission-runner.ts`, `mission-types.ts`, `build-tool-registry.ts`, `fake-rag.ts`, `fake-tool-source.ts`, `efficiency-scenarios.ts` — are added to the project for linting + tsc.)

- [ ] **Step 4: Run lint and fix REAL issues**

Run: `npm run lint`
- If it surfaces errors on the helper files that are genuine (a real floating promise, an unused var, a genuinely-unsafe pattern not covered by the relaxation), FIX them in the helper file.
- If a relaxed rule still fires inappropriately, confirm the override `files` glob matches (the helper files are under `tests/harness/` etc., NOT `.test.ts`, so they're linted, not ignored).
- Do NOT add blanket `eslint-disable` comments (the config requires descriptions and forbids unused disables); prefer fixing or the scoped override.
Expected end state: `npm run lint` clean.

- [ ] **Step 5: Run tsc + full suite to confirm the include change is clean**

Run: `npx tsc --noEmit -p tsconfig.json` → expect clean (the helper files were already type-checked by ts-jest; tsc should agree). Fix any real type errors surfaced.
Run: `npm test` → full suite still green.
Run: `npm run build` → still succeeds (build uses its own esbuild path; confirm the tsconfig include change didn't break type-checking in the build).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mts package.json tsconfig.json
git commit -m "ci: extend lint + tsconfig coverage to harness/mission/perf source"
```

---

## Definition of Done

- `verification-gate.yml` exists, parses, and every gate command it runs succeeds locally.
- The gate is purely additive — `e2e.yml`, `pull-request.yml`, and the WDIO specs are untouched.
- `npm run lint` now covers the harness/mission/perf helper source (with an appropriate override) and is clean; `tsc --noEmit` includes them and is clean.
- `npm test`, flake-soak, mutation, and perf:mem all green locally.
- Deferred items (version pinning, E2E thinning, jest projects split, mutation widening) are documented as recommendations, not silently dropped.

## Self-Review Notes

- **Spec coverage:** Implements §7 release contract for the deterministic layers (L1 + L2 + L4 + flake-soak + mutation as the PR-blocking gate). L3 (WDIO version matrix) and L5 (nightly real-LLM) remain in the existing `e2e.yml`; pinning/thinning are documented recommendations, deliberately not applied to avoid breaking currently-passing CI.
- **Additive & non-destructive:** no existing workflow or spec file is modified except the lint/tsconfig config (additive includes) — honoring "don't break the maintainer's working CI."
- **Why ubuntu + node 22:** matches `pull-request.yml` (`22.x`, ubuntu); the deterministic gate needs no Electron, so it's fast and cheap, unlike the macOS WDIO job.
