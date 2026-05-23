# E2E Rebuild — Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rip out the old E2E "test theater" and lay down the foundation (clean directories, mock infrastructure, vault isolation, central testids, ESLint guards, one passing smoke spec) so subsequent phases can layer functional/agent/release tests on top.

**Architecture:** Three-layer test pyramid (L1 smoke / L2 functional CI / L3 release). All specs interact with DOM only through Page Objects keyed by central `data-testid` constants. Each spec resets the vault from `fixtures/vault-template/` via `VaultFixture` so no state leaks. CI mocks LLM HTTP and MCP subprocesses; persistence (settings.json, conversations, vector store) runs real.

**Tech Stack:** WebdriverIO 9 + Mocha + wdio-obsidian-service, TypeScript, ESLint 9 (flat config), fs-extra for vault snapshotting, plain Node script for mock MCP server.

**Companion spec:** `docs/superpowers/specs/2026-05-24-e2e-rebuild-design.md`

**This plan ships:**
- Empty `tests/e2e/` skeleton aligned with the new architecture
- `tests/e2e/support/{vault-fixture,mock-llm,mock-mcp-server,plugin-helpers,testids,base-page}` infrastructure
- `src/presentation/utils/test-ids.ts` synced with the test side
- `data-testid` attributes injected for chat input/send/messages and settings shell (minimum for smoke)
- New `wdio.ci.conf.ts` + `wdio.release.conf.ts` (both inherit from a slim `wdio.conf.ts`)
- ESLint rule banning `browser.pause` and raw `$/$$` in spec files
- One green smoke spec: load plugin → open chat → send message (mocked) → assert reply text + persistence

Phases P1–P3 will be planned separately once this lands.

---

## Pre-flight: assumptions an executor should verify

- Working directory: `/Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant`
- Current branch: `tool-system-refactor` — Phase 0 work commits onto this branch
- Node + npm already work (`npm run build`, `npm run lint` are gates per CLAUDE.md)
- `tests/e2e/test-vault/.obsidian/plugins/intelligence-assistant/` exists and is the runtime vault — we will keep that directory but rebuild its content from `fixtures/vault-template/` at runtime

---

## Task 1: Inventory references to soon-to-be-deleted files

**Files:** none modified — research only

- [ ] **Step 1: Grep for imports of utils/* from anywhere outside tests/e2e**

```bash
grep -rn "tests/e2e/utils" --include="*.ts" --include="*.js" --include="*.json" \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/src \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/scripts \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/main.ts 2>/dev/null
```

Expected: no output. If anything appears, stop and record the reference.

- [ ] **Step 2: Grep for npm scripts referencing soon-deleted paths**

```bash
grep -n "wdio.chrome\|wdio.firefox\|wdio.screenshot\|specs/ci/chat\|specs/ci/settings\|specs/ci/security" \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/package.json
```

Expected: lines 29, 33, 34, 35, 36 of package.json. We will rewrite these in Task 6.

- [ ] **Step 3: Confirm tests/__mocks__ is for Jest only and unrelated to E2E**

```bash
grep -rln "from.*tests/__mocks__\|from.*tests/e2e" \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/src \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/main.ts
```

Expected: no output (src has no test imports). If anything matches, stop.

---

## Task 2: Delete old E2E spec + page + utils + mocks directories

**Files:**
- Delete: `tests/e2e/specs/` (whole tree)
- Delete: `tests/e2e/pages/` (whole tree)
- Delete: `tests/e2e/utils/` (whole tree, including `test-safety.ts`)
- Delete: `tests/e2e/mocks/` (we'll re-import the response fixtures into `tests/e2e/fixtures/responses/` in Task 7)

- [ ] **Step 1: Copy the fixture JSON responses to a safe holding spot before deleting mocks**

```bash
mkdir -p /tmp/e2e-fixtures-stash
cp /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/tests/e2e/mocks/responses/*.json \
   /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/tests/e2e/mocks/responses/*.txt \
   /tmp/e2e-fixtures-stash/
ls /tmp/e2e-fixtures-stash/
```

Expected: 7 files (chat-error-429.json, chat-error-500.json, chat-simple-reply.json, chat-streaming-reply.txt, chat-tool-call.json, chat-tool-result.json, models-list.json).

- [ ] **Step 2: Remove the four directories with git rm**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git rm -r tests/e2e/specs tests/e2e/pages tests/e2e/utils tests/e2e/mocks
```

Expected: many lines reading `rm 'tests/e2e/...'`.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(e2e): remove legacy E2E specs, pages, utils, and mocks

Wipes the old "test-theater" suite (security tests that only check UI
didn't crash, CRUD specs that open-then-cancel, browser.pause-driven
waits, safe-fail helpers) ahead of the Phase 0 foundation rebuild.
Fixture responses are stashed at /tmp/e2e-fixtures-stash and will be
re-introduced under tests/e2e/fixtures/responses in a later task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Delete stale E2E markdown docs + root-level log files + src .backup files

**Files:**
- Delete: `tests/e2e/MANUAL_E2E_TEST_PLAN.md`
- Delete: `tests/e2e/BUSINESS_SCENARIO_COVERAGE.md`
- Delete: `tests/e2e/OPTIMIZATION_SUMMARY.md`
- Delete: `tests/e2e/TEST_OPTIMIZATION_LOG.md`
- Delete: `tests/e2e/TEST_REVIEW.md`
- Delete: `tests/e2e/MCP_TEST_COVERAGE.md`
- Delete: `tests/e2e/RAG_TEST_COVERAGE.md`
- Delete: `tests/e2e/TOOLS_TEST_COVERAGE.md`
- Delete: `tests/e2e/QUICKACTIONS_TEST_COVERAGE.md`
- Delete: `tests/e2e/EXAMPLES.md`
- Delete: `tests/E2E_TEST_MAPPING.md`
- Delete: `tests/*.log` (40+ historical run logs)
- Delete: `src/presentation/components/tabs/*.backup`
- Modify: `.gitignore` (add `*.log` if missing)

- [ ] **Step 1: Delete stale markdown docs**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git rm tests/e2e/MANUAL_E2E_TEST_PLAN.md \
       tests/e2e/BUSINESS_SCENARIO_COVERAGE.md \
       tests/e2e/OPTIMIZATION_SUMMARY.md \
       tests/e2e/TEST_OPTIMIZATION_LOG.md \
       tests/e2e/TEST_REVIEW.md \
       tests/e2e/MCP_TEST_COVERAGE.md \
       tests/e2e/RAG_TEST_COVERAGE.md \
       tests/e2e/TOOLS_TEST_COVERAGE.md \
       tests/e2e/QUICKACTIONS_TEST_COVERAGE.md \
       tests/e2e/EXAMPLES.md \
       tests/E2E_TEST_MAPPING.md
```

- [ ] **Step 2: Delete historical log files in tests/ (these were never tracked but are clutter)**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
ls tests/*.log 2>/dev/null | head -5    # confirm they exist
rm -f tests/*.log
ls tests/*.log 2>/dev/null && echo "STILL THERE" || echo "clean"
```

Expected: ends with `clean`.

- [ ] **Step 3: Delete .backup files (untracked refactor leftovers)**

```bash
find /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/src \
  -name "*.backup" -print -delete
```

Expected: list of ~10 `.backup` files then they're gone.

- [ ] **Step 4: Ensure .gitignore covers *.log**

Check current state first:

```bash
grep -n "\*\.log\|^\*\.log" /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/.gitignore || echo "MISSING"
```

If `MISSING`, append it. Otherwise skip the next sub-step. To append:

Read `.gitignore`, then add `*.log` as a new line under a comment `# Test run logs` near the end. Use the Edit tool — do not write the whole file.

- [ ] **Step 5: Commit**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add -A
git status   # verify only deletions + maybe .gitignore
git commit -m "$(cat <<'EOF'
chore: remove stale E2E docs, run logs, and .backup files

Removes:
- 11 outdated E2E markdown docs (test plans, coverage reports, optimization
  logs) that were never the source of truth and contradict the new design
- 40+ tests/*.log historical run outputs (now .gitignored)
- Refactor leftover *.backup files under src/presentation/components/tabs/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Delete unused WDIO configs

**Files:**
- Delete: `wdio.chrome.conf.ts`
- Delete: `wdio.firefox.conf.ts`
- Delete: `wdio.screenshot.conf.ts`

- [ ] **Step 1: Confirm no spec or helper imports from these**

```bash
grep -rn "wdio\.chrome\|wdio\.firefox\|wdio\.screenshot" \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant \
  --include="*.ts" --include="*.json" --exclude-dir=node_modules \
  | grep -v "^docs/"
```

Expected: only matches in `package.json` scripts (will fix in Task 6).

- [ ] **Step 2: Delete the files**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git rm wdio.chrome.conf.ts wdio.firefox.conf.ts wdio.screenshot.conf.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(e2e): remove unused wdio Chrome/Firefox/screenshot configs

The plugin is Obsidian-desktop-only — non-Obsidian browsers were never
exercised and the screenshot config produced no current artifacts. The
new architecture has one base wdio.conf.ts plus ci/release flavors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Slim wdio.conf.ts to a base and rewrite ci/release configs

**Files:**
- Modify: `wdio.conf.ts` (becomes a minimal base; specs come from the per-suite configs)
- Modify: `tests/e2e/config/wdio.ci.conf.ts` (CI suite — mock LLM, fast)
- Modify: `tests/e2e/config/wdio.release.conf.ts` (release suite — real API; we will read the existing one and align)

Goals:
- `wdio.conf.ts` exports a `baseConfig` (no `specs`, no `onPrepare`, no `onComplete` — those live in per-suite configs)
- `wdio.ci.conf.ts` covers `tests/e2e/specs/**/*.spec.ts` except `release/**`
- `wdio.release.conf.ts` covers `tests/e2e/specs/release/**/*.spec.ts`
- Remove the dead commented-out `afterTest` block

- [ ] **Step 1: Rewrite wdio.conf.ts**

Replace the entire contents of `wdio.conf.ts` with:

```ts
import * as path from 'path';
import type { Options } from '@wdio/types';

const cacheDir = path.resolve('.obsidian-cache');
const obsidianVersion = process.env.OBSIDIAN_VERSION || 'latest';

/**
 * Base WDIO config shared by the CI and Release suites.
 * Per-suite configs supply `specs`, `onPrepare`, `onComplete`, and
 * any suite-specific timeouts.
 */
export const baseConfig: Options.Testrunner = {
	runner: 'local',
	framework: 'mocha',

	exclude: [
		path.resolve('tests/e2e/fixtures/**'),
		path.resolve('tests/e2e/support/**'),
		path.resolve('tests/e2e/pages/**'),
		path.resolve('tests/e2e/config/**'),
	],

	maxInstances: 1,

	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion: obsidianVersion,
				installerVersion: obsidianVersion,
				plugins: [path.resolve('.')],
				vault: path.resolve('tests/e2e/test-vault'),
			},
		},
	],

	services: ['obsidian'],

	reporters: ['spec'],

	mochaOpts: {
		ui: 'bdd',
		timeout: 90 * 1000,
	},

	waitforInterval: 250,
	waitforTimeout: 10 * 1000,

	logLevel: 'warn',

	cacheDir,

	autoCompileOpts: {
		autoCompile: true,
		tsNodeOpts: {
			transpileOnly: true,
			project: 'tsconfig.json',
		},
	},
};

// Default export so existing `wdio run wdio.conf.ts` is a no-op error rather
// than silently picking up the base config and running nothing.
export const config: Options.Testrunner = {
	...baseConfig,
	specs: [],
	onPrepare() {
		throw new Error(
			'Do not run wdio.conf.ts directly. Use:\n' +
			'  npm run test:e2e:ci\n' +
			'  npm run test:e2e:release'
		);
	},
};
```

- [ ] **Step 2: Rewrite tests/e2e/config/wdio.ci.conf.ts**

Replace the entire contents with:

```ts
/**
 * CI E2E config — mocked LLM, mocked MCP subprocess, real persistence.
 * No API keys required; runs offline.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { baseConfig } from '../../../wdio.conf';
import { resetVaultTemplate } from '../support/vault-fixture';

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
		await resetVaultTemplate();
	},
};
```

- [ ] **Step 3: Rewrite tests/e2e/config/wdio.release.conf.ts**

Replace the entire contents with:

```ts
/**
 * Release E2E config — real LLM + real MCP subprocess.
 * Requires .env.test with E2E_TEST_PROVIDER, E2E_TEST_API_KEY, E2E_TEST_MODEL.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { baseConfig } from '../../../wdio.conf';
import { resetVaultTemplate, seedReleaseProvider } from '../support/vault-fixture';

export const config: Options.Testrunner = {
	...baseConfig,

	specs: [path.resolve('tests/e2e/specs/release/**/*.spec.ts')],

	mochaOpts: {
		ui: 'bdd',
		timeout: 180 * 1000,
	},

	async onPrepare() {
		await resetVaultTemplate();
		await seedReleaseProvider();
	},
};
```

Note: `resetVaultTemplate` and `seedReleaseProvider` are defined in Task 9. This file will fail typecheck until then — that's fine, we land it as part of Task 9's commit.

- [ ] **Step 4: Run typecheck and confirm only the expected error**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about `support/vault-fixture` not found — those resolve in Task 9. Anything else is a real problem; stop and investigate.

- [ ] **Step 5: Stash for later commit**

Do NOT commit yet. The two `tests/e2e/config/wdio.*.conf.ts` files reference a module that doesn't exist; we commit together with Task 9.

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add wdio.conf.ts tests/e2e/config/wdio.ci.conf.ts tests/e2e/config/wdio.release.conf.ts
git status
```

Expected: three modified files staged.

---

## Task 6: Update package.json E2E scripts

**Files:**
- Modify: `package.json` (lines 26–36 of the scripts block)

- [ ] **Step 1: Read current scripts**

Use Read on `package.json`. Confirm the scripts block matches what you saw in pre-flight.

- [ ] **Step 2: Replace E2E-related scripts**

Use Edit to replace this exact block:

```json
        "test:e2e": "wdio run wdio.conf.ts",
        "test:e2e:headed": "wdio run wdio.conf.ts --headless=false",
        "test:e2e:debug": "wdio run wdio.conf.ts --debug",
        "test:e2e:chrome": "wdio run wdio.chrome.conf.ts",
        "test:e2e:firefox": "wdio run wdio.firefox.conf.ts",
        "test:e2e:ci": "wdio run tests/e2e/config/wdio.ci.conf.ts",
        "test:e2e:release": "wdio run tests/e2e/config/wdio.release.conf.ts",
        "test:e2e:ci:chat": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec='tests/e2e/specs/ci/chat/**/*.spec.ts'",
        "test:e2e:ci:settings": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec='tests/e2e/specs/ci/settings/**/*.spec.ts'",
        "test:e2e:ci:security": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec='tests/e2e/specs/ci/security/**/*.spec.ts'",
        "test:screenshots": "wdio run wdio.screenshot.conf.ts",
```

With:

```json
        "test:e2e": "wdio run tests/e2e/config/wdio.ci.conf.ts",
        "test:e2e:ci": "wdio run tests/e2e/config/wdio.ci.conf.ts",
        "test:e2e:release": "wdio run tests/e2e/config/wdio.release.conf.ts",
        "test:e2e:smoke": "wdio run tests/e2e/config/wdio.ci.conf.ts --spec='tests/e2e/specs/00-smoke.spec.ts'",
```

- [ ] **Step 3: Verify JSON still parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('/Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/package.json'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Stage but do not commit yet** (commit alongside Tasks 5/9 once VaultFixture exists)

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add package.json
```

---

## Task 7: Create new tests/e2e directory skeleton + restored fixtures

**Files:**
- Create: `tests/e2e/fixtures/responses/{chat-error-429,chat-error-500,chat-simple-reply,chat-tool-call,chat-tool-result,models-list}.json`
- Create: `tests/e2e/fixtures/responses/chat-streaming-reply.txt`
- Create: `tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user/settings.json` (a known-good baseline)
- Create: `tests/e2e/fixtures/vault-template/README.md` (one note used by RAG specs later)
- Create: `tests/e2e/pages/.gitkeep`
- Create: `tests/e2e/support/.gitkeep`
- Create: `tests/e2e/specs/.gitkeep`

- [ ] **Step 1: Create directories and restore fixture JSON**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
mkdir -p tests/e2e/fixtures/responses
mkdir -p tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user
mkdir -p tests/e2e/pages tests/e2e/support tests/e2e/specs/release
cp /tmp/e2e-fixtures-stash/*.json /tmp/e2e-fixtures-stash/*.txt tests/e2e/fixtures/responses/
ls tests/e2e/fixtures/responses/
```

Expected: 7 files restored.

- [ ] **Step 2: Create minimal vault-template settings.json**

Write to `tests/e2e/fixtures/vault-template/.obsidian/plugins/intelligence-assistant/config/user/settings.json`:

```json
{
  "providers": {
    "list": [
      {
        "provider": "openai",
        "apiKey": "sk-test-fixture",
        "baseUrl": "https://api.openai.com/v1",
        "cachedModels": [
          {
            "id": "gpt-4o-mini",
            "name": "GPT-4o Mini",
            "provider": "openai",
            "capabilities": ["chat", "streaming"],
            "enabled": true
          }
        ],
        "cacheTimestamp": 0
      }
    ],
    "defaultModel": "gpt-4o-mini",
    "titleSummaryModel": "gpt-4o-mini"
  },
  "rag": {
    "enabled": false,
    "embedding": { "model": "text-embedding-3-small" }
  },
  "mcp": {
    "servers": [],
    "registries": []
  }
}
```

This is the baseline every spec starts from. Specs that need richer state will call `vault.reset('with-...')` (later phases).

- [ ] **Step 3: Create one note for future RAG specs**

Write to `tests/e2e/fixtures/vault-template/README.md`:

```markdown
# Intelligence Assistant Test Vault

This vault is reset from `tests/e2e/fixtures/vault-template/` before
every spec. Specs that need extra notes should add them to
`vault-template/` rather than the live `test-vault/`.
```

- [ ] **Step 4: Add .gitkeep placeholders so empty dirs survive**

Write empty files at:
- `tests/e2e/pages/.gitkeep`
- `tests/e2e/support/.gitkeep`
- `tests/e2e/specs/.gitkeep` (will be removed when smoke spec lands)

- [ ] **Step 5: Stage**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add tests/e2e/
git status   # confirm fixtures + gitkeeps only
```

---

## Task 8: Add centralized test-id constants (source + test sides)

**Files:**
- Create: `src/presentation/utils/test-ids.ts` (source of truth for component code)
- Create: `tests/e2e/support/testids.ts` (re-exports the same constants for test code)

Rationale: One constant per testid string; both sides import from one place; renames are compiler-enforced.

- [ ] **Step 1: Create src/presentation/utils/test-ids.ts**

Write:

```ts
/**
 * Stable selectors for E2E tests. Add new ids here as needed.
 *
 * Convention: `ia-<scope>-<element>[-<modifier>]`
 */
export const TestIds = {
	// Chat view
	chat: {
		container: 'ia-chat-container',
		input: 'ia-chat-input',
		sendBtn: 'ia-chat-send-btn',
		stopBtn: 'ia-chat-stop-btn',
		newBtn: 'ia-chat-new-btn',
		emptyState: 'ia-chat-empty-state',
		messageList: 'ia-chat-message-list',
		message: 'ia-chat-msg',                  // + data-role, data-msg-id
		modelSelect: 'ia-chat-model-select',
		modeSelect: 'ia-chat-mode-select',
	},

	// Settings shell
	settings: {
		shell: 'ia-settings-shell',
		tab: 'ia-settings-tab',                  // + data-tab-id
	},
} as const;
```

- [ ] **Step 2: Create tests/e2e/support/testids.ts**

Write:

```ts
/**
 * Re-export of source-side TestIds so spec/page code and component code
 * stay in lockstep. Do NOT define new ids here — add them in
 * src/presentation/utils/test-ids.ts.
 */
export { TestIds } from '../../../src/presentation/utils/test-ids';
```

- [ ] **Step 3: Verify both files compile**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npx tsc --noEmit 2>&1 | grep -E "test-ids|testids" || echo "no test-id errors"
```

Expected: `no test-id errors`.

- [ ] **Step 4: Stage**

```bash
git add src/presentation/utils/test-ids.ts tests/e2e/support/testids.ts
```

---

## Task 9: Build VaultFixture + plugin-helpers

**Files:**
- Create: `tests/e2e/support/vault-fixture.ts`
- Create: `tests/e2e/support/plugin-helpers.ts`

VaultFixture responsibilities:
1. `resetVaultTemplate()` — wipe and recreate `tests/e2e/test-vault/.obsidian/plugins/intelligence-assistant/` from `tests/e2e/fixtures/vault-template/`. Called from `onPrepare`.
2. `seedReleaseProvider()` — overlay credentials from `.env.test` onto the seed settings (release only).
3. Class `VaultFixture` — spec-side instance with `reset(profile?)`, `readDataFile<T>(rel)`, `reloadPlugin()`.

Plugin-helpers responsibilities:
1. `waitForPluginReady()` — wait for the plugin's initialization promise to settle (heuristic: a top-level marker on `window`).
2. `reloadPlugin()` — disable then re-enable the plugin via Obsidian's plugin manager API.

- [ ] **Step 1: Implement vault-fixture.ts**

Write `tests/e2e/support/vault-fixture.ts`:

```ts
import * as fs from 'fs-extra';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const VAULT_ROOT = path.join(REPO_ROOT, 'tests/e2e/test-vault');
const PLUGIN_DIR_REL = '.obsidian/plugins/intelligence-assistant';
const TEMPLATE_ROOT = path.join(REPO_ROOT, 'tests/e2e/fixtures/vault-template');

const LIVE_PLUGIN_DIR = path.join(VAULT_ROOT, PLUGIN_DIR_REL);
const TEMPLATE_PLUGIN_DIR = path.join(TEMPLATE_ROOT, PLUGIN_DIR_REL);

/**
 * Wipe and recreate the test vault's plugin data folder from the template.
 * Called from `onPrepare` hooks and from spec-side `VaultFixture.reset()`.
 */
export async function resetVaultTemplate(): Promise<void> {
	if (!(await fs.pathExists(TEMPLATE_PLUGIN_DIR))) {
		throw new Error(`vault-template missing at ${TEMPLATE_PLUGIN_DIR}`);
	}
	await fs.remove(LIVE_PLUGIN_DIR);
	await fs.ensureDir(path.dirname(LIVE_PLUGIN_DIR));
	await fs.copy(TEMPLATE_PLUGIN_DIR, LIVE_PLUGIN_DIR);
}

/**
 * For the release suite: overlay real provider credentials onto the seed
 * settings file. Reads .env.test for E2E_TEST_PROVIDER, E2E_TEST_API_KEY,
 * E2E_TEST_MODEL. No-op if any are missing — release specs will skip
 * themselves when env detection fails.
 */
export async function seedReleaseProvider(): Promise<void> {
	const provider = process.env.E2E_TEST_PROVIDER;
	const apiKey = process.env.E2E_TEST_API_KEY;
	const model = process.env.E2E_TEST_MODEL;
	if (!provider || !apiKey || !model) return;

	const settingsPath = path.join(
		LIVE_PLUGIN_DIR,
		'config/user/settings.json'
	);
	const settings = await fs.readJson(settingsPath) as Record<string, unknown>;
	const providers = (settings.providers ?? {}) as Record<string, unknown>;
	const list = Array.isArray(providers.list) ? providers.list : [];
	list.unshift({
		provider,
		apiKey,
		baseUrl: process.env.E2E_TEST_BASE_URL ?? '',
		cachedModels: [{ id: model, name: model, provider, capabilities: ['chat', 'streaming'], enabled: true }],
		cacheTimestamp: Date.now(),
	});
	providers.list = list;
	providers.defaultModel = model;
	providers.titleSummaryModel = model;
	settings.providers = providers;
	await fs.writeJson(settingsPath, settings, { spaces: 2 });
}

/**
 * Spec-side helper. Each spec instantiates one of these and calls
 * `await vault.reset()` in `beforeEach`.
 */
export class VaultFixture {
	async reset(): Promise<void> {
		await resetVaultTemplate();
	}

	async readDataFile<T = unknown>(relativePath: string): Promise<T> {
		const full = path.join(LIVE_PLUGIN_DIR, relativePath);
		return fs.readJson(full) as Promise<T>;
	}

	async dataFileExists(relativePath: string): Promise<boolean> {
		return fs.pathExists(path.join(LIVE_PLUGIN_DIR, relativePath));
	}

	getPluginDir(): string {
		return LIVE_PLUGIN_DIR;
	}
}
```

- [ ] **Step 2: Implement plugin-helpers.ts**

Write `tests/e2e/support/plugin-helpers.ts`:

```ts
const PLUGIN_ID = 'intelligence-assistant';

/**
 * Wait until Obsidian reports the plugin as enabled and its main view type
 * is registered. Throws if it isn't ready within `timeoutMs`.
 */
export async function waitForPluginReady(timeoutMs = 15000): Promise<void> {
	await browser.waitUntil(
		async () => {
			return browser.execute((pluginId) => {
				const app = (window as unknown as { app?: {
					plugins?: { plugins: Record<string, unknown> };
					workspace?: { getLeavesOfType: (t: string) => unknown[] };
				} }).app;
				if (!app?.plugins?.plugins) return false;
				return Boolean(app.plugins.plugins[pluginId]);
			}, PLUGIN_ID);
		},
		{ timeout: timeoutMs, timeoutMsg: `Plugin ${PLUGIN_ID} did not initialize` }
	);
}

/**
 * Disable then re-enable the plugin. Used by persistence specs to verify
 * settings survive a restart cycle without nuking Obsidian.
 */
export async function reloadPlugin(): Promise<void> {
	await browser.execute(async (pluginId) => {
		const pluginsApi = (window as unknown as { app: {
			plugins: {
				disablePlugin(id: string): Promise<void>;
				enablePlugin(id: string): Promise<void>;
			};
		} }).app.plugins;
		await pluginsApi.disablePlugin(pluginId);
		await pluginsApi.enablePlugin(pluginId);
	}, PLUGIN_ID);
	await waitForPluginReady();
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npx tsc --noEmit 2>&1 | grep -E "vault-fixture|plugin-helpers|wdio\." || echo "OK"
```

Expected: `OK`. If anything else, fix.

- [ ] **Step 4: Commit Tasks 5–9 together**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add wdio.conf.ts tests/e2e/config/wdio.ci.conf.ts tests/e2e/config/wdio.release.conf.ts \
        package.json tests/e2e/ src/presentation/utils/test-ids.ts
git status   # confirm everything from Tasks 5-9 is staged
git commit -m "$(cat <<'EOF'
test(e2e): foundation — wdio config split, vault fixture, testids

- wdio.conf.ts now only exports a baseConfig (no specs/hooks)
- tests/e2e/config/wdio.ci.conf.ts: mocked LLM, fast
- tests/e2e/config/wdio.release.conf.ts: real APIs, seeded from .env.test
- VaultFixture resets the live plugin dir from fixtures/vault-template/
  before every spec; readDataFile/reloadPlugin replace the old shared
  state model
- TestIds constants exported from both src/presentation/utils/test-ids.ts
  and tests/e2e/support/testids.ts (re-export) so a rename in code breaks
  the test build
- package.json: collapse 10 e2e scripts to 4 (e2e/ci/release/smoke)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Build mock-llm helper

**Files:**
- Create: `tests/e2e/support/mock-llm.ts`

Goals:
- Wraps `browser.mock()` with a domain API
- Supports: `replyWith(text)`, `toolCall(name, args)`, `errorStatus(code)`, `scenario(steps)`, `getCalls()`, `clearAll()`
- Uses fixtures in `tests/e2e/fixtures/responses/` as templates

- [ ] **Step 1: Implement tests/e2e/support/mock-llm.ts**

Write:

```ts
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/responses');

type ChatMessage = { role: string; content: string };

interface MockState {
	mocks: WebdriverIO.Mock[];
	calls: { url: string; body: { messages?: ChatMessage[]; model?: string } | null }[];
}

const state: MockState = { mocks: [], calls: [] };

function readFixture(name: string): string {
	return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

async function installChatMock(payload: { statusCode: number; body: string; contentType?: string }): Promise<void> {
	const mock = await browser.mock('**/v1/chat/completions');
	mock.respond(payload.body, {
		statusCode: payload.statusCode,
		headers: { 'content-type': payload.contentType ?? 'application/json' },
	});
	state.mocks.push(mock);
}

export const mockLLM = {
	/** Mock a single text reply. */
	async replyWith(text: string): Promise<void> {
		const body = JSON.stringify({
			id: 'cmpl_mock',
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: 'gpt-4o-mini',
			choices: [{
				index: 0,
				message: { role: 'assistant', content: text },
				finish_reason: 'stop',
			}],
			usage: { prompt_tokens: 1, completion_tokens: text.length, total_tokens: text.length + 1 },
		});
		await installChatMock({ statusCode: 200, body });
	},

	/** Mock an error response. */
	async errorStatus(code: 401 | 429 | 500): Promise<void> {
		const fixtureMap: Record<number, string> = {
			401: 'chat-error-500.json',  // reuse 500 shape for now
			429: 'chat-error-429.json',
			500: 'chat-error-500.json',
		};
		const body = readFixture(fixtureMap[code]);
		await installChatMock({ statusCode: code, body });
	},

	/** Return all chat-completion requests captured so far. */
	getCalls(): { url: string; body: unknown }[] {
		return state.calls.slice();
	},

	/** Tear down all installed mocks; call in afterEach. */
	async clearAll(): Promise<void> {
		for (const mock of state.mocks) {
			await mock.restore();
		}
		state.mocks.length = 0;
		state.calls.length = 0;
	},
};
```

Note: this is the minimum API needed for the smoke spec (`replyWith`). `toolCall`/`scenario`/`getCalls` request-capture will be expanded in P1's plan when the agent loop spec needs them.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep mock-llm || echo OK
```

Expected: `OK`.

- [ ] **Step 3: Stage** (commit alongside Task 11)

```bash
git add tests/e2e/support/mock-llm.ts
```

---

## Task 11: Add ESLint rule banning browser.pause + raw selectors in specs

**Files:**
- Modify: `eslint.config.mts` (add a new flat-config block scoped to `tests/e2e/**/*.ts`)

- [ ] **Step 1: Read current eslint.config.mts**

(Already inspected — note the file ends after the `base-streaming-provider.ts` override block.)

- [ ] **Step 2: Append a new flat-config block before the closing `])`**

Use Edit. Find:

```ts
  {
    files: ["**/base-streaming-provider.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use an Obsidian modal instead of confirm." },
        { name: "event", message: "The global event object is deprecated." }
        // fetch intentionally omitted: requestUrl cannot handle SSE streaming
      ]
    }
  }
]);
```

Replace with:

```ts
  {
    files: ["**/base-streaming-provider.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use an Obsidian modal instead of confirm." },
        { name: "event", message: "The global event object is deprecated." }
        // fetch intentionally omitted: requestUrl cannot handle SSE streaming
      ]
    }
  },

  // E2E test discipline: no hardcoded sleeps; specs may not touch DOM directly.
  {
    files: ["tests/e2e/specs/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='browser'][callee.property.name='pause']",
          message: "Use page object waitFor* helpers or browser.waitUntil(condition) — no hardcoded sleeps.",
        },
        {
          selector: "CallExpression[callee.name='$']",
          message: "Specs must use Page Objects — do not call $ directly.",
        },
        {
          selector: "CallExpression[callee.name='$$']",
          message: "Specs must use Page Objects — do not call $$ directly.",
        },
      ],
    },
  },

  {
    files: ["tests/e2e/pages/**/*.ts", "tests/e2e/support/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='browser'][callee.property.name='pause']",
          message: "Use browser.waitUntil(condition) — no hardcoded sleeps.",
        },
      ],
    },
  }
]);
```

- [ ] **Step 3: Run lint to confirm config parses**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npm run lint 2>&1 | tail -20
```

Expected: lint passes (no new errors — we haven't added offending code).

- [ ] **Step 4: Smoke-test the rule by temporarily adding a bad file**

```bash
cat > /tmp/eslint-pause-test.ts <<'EOF'
async function run() {
  await browser.pause(500);
}
EOF
cp /tmp/eslint-pause-test.ts /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/tests/e2e/specs/pause-check.spec.ts
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npx eslint tests/e2e/specs/pause-check.spec.ts 2>&1 | tail -10
rm tests/e2e/specs/pause-check.spec.ts
```

Expected output: lint complains with the `no hardcoded sleeps` message.

- [ ] **Step 5: Commit Tasks 10 + 11**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add tests/e2e/support/mock-llm.ts eslint.config.mts
git commit -m "$(cat <<'EOF'
test(e2e): mock-llm helper + lint rules banning browser.pause and raw $/$$

mock-llm wraps browser.mock with a domain-friendly API (replyWith,
errorStatus, clearAll) so specs don't reach into wdio internals.

ESLint flat-config additions:
- tests/e2e/specs/**: browser.pause is banned (use waitUntil); $ and $$
  are banned (specs must go through Page Objects).
- tests/e2e/pages|support/**: browser.pause is banned everywhere.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Build BasePage and minimal ChatViewPage

**Files:**
- Create: `tests/e2e/pages/base.page.ts`
- Create: `tests/e2e/pages/chat/chat-view.page.ts`

- [ ] **Step 1: Implement BasePage**

Write `tests/e2e/pages/base.page.ts`:

```ts
/**
 * Shared selector primitives for all Page Objects.
 * Selectors target `data-testid` attributes only.
 */
export abstract class BasePage {
	protected $testid(id: string): ChainablePromiseElement {
		return $(`[data-testid="${id}"]`);
	}

	protected $$testid(id: string): ChainablePromiseArray {
		return $$(`[data-testid="${id}"]`);
	}

	protected async waitFor(id: string, timeoutMs = 10_000): Promise<void> {
		await this.$testid(id).waitForDisplayed({ timeout: timeoutMs });
	}

	protected async click(id: string): Promise<void> {
		await this.waitFor(id);
		await this.$testid(id).click();
	}

	protected async type(id: string, value: string): Promise<void> {
		await this.waitFor(id);
		await this.$testid(id).setValue(value);
	}

	protected async getText(id: string): Promise<string> {
		await this.waitFor(id);
		return this.$testid(id).getText();
	}

	protected async isVisible(id: string): Promise<boolean> {
		return this.$testid(id).isDisplayed().catch(() => false);
	}
}
```

Note: `ChainablePromiseElement` and `ChainablePromiseArray` are global WebdriverIO types — they don't need an import.

- [ ] **Step 2: Implement ChatViewPage**

Write `tests/e2e/pages/chat/chat-view.page.ts`:

```ts
import { BasePage } from '../base.page';
import { TestIds } from '../../support/testids';

const PLUGIN_VIEW_TYPE = 'intelligence-assistant-chat';

export interface ChatMessage {
	role: 'user' | 'assistant';
	text: string;
}

export class ChatViewPage extends BasePage {
	/** Open the chat view via Obsidian's workspace API. */
	async open(): Promise<void> {
		await browser.execute((viewType) => {
			const app = (window as unknown as {
				app: {
					workspace: {
						getLeavesOfType(t: string): unknown[];
						getLeaf(action: string): {
							setViewState(state: { type: string; active: boolean }): Promise<void>;
						};
						setActiveLeaf(leaf: unknown): void;
					};
				};
			}).app;
			const existing = app.workspace.getLeavesOfType(viewType);
			if (existing.length > 0) {
				app.workspace.setActiveLeaf(existing[0]);
				return;
			}
			void app.workspace.getLeaf('tab').setViewState({ type: viewType, active: true });
		}, PLUGIN_VIEW_TYPE);
		await this.waitFor(TestIds.chat.container);
	}

	async newChat(): Promise<void> {
		await this.click(TestIds.chat.newBtn);
		await this.waitFor(TestIds.chat.emptyState);
	}

	async sendMessage(text: string): Promise<void> {
		await this.type(TestIds.chat.input, text);
		await this.click(TestIds.chat.sendBtn);
	}

	async waitForReplyComplete(timeoutMs = 15_000): Promise<void> {
		await browser.waitUntil(
			async () => {
				const msgs = await this.$$testid(TestIds.chat.message);
				if (msgs.length < 2) return false;
				const stopVisible = await this.isVisible(TestIds.chat.stopBtn);
				return !stopVisible;
			},
			{ timeout: timeoutMs, timeoutMsg: 'Assistant reply did not complete' }
		);
	}

	async getMessages(): Promise<ChatMessage[]> {
		const elems = await this.$$testid(TestIds.chat.message);
		const out: ChatMessage[] = [];
		for (const el of elems) {
			const role = (await el.getAttribute('data-role')) as 'user' | 'assistant';
			const text = (await el.getText()).trim();
			out.push({ role, text });
		}
		return out;
	}

	async getConversationId(): Promise<string> {
		return browser.execute(() => {
			const app = (window as unknown as {
				app: { plugins: { plugins: Record<string, {
					conversationManager?: { activeConversationId?: string };
				}> } };
			}).app;
			const plugin = app.plugins.plugins['intelligence-assistant'];
			return plugin?.conversationManager?.activeConversationId ?? '';
		});
	}
}
```

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/pages/
```

(Commit alongside Tasks 13–15.)

---

## Task 13: Inject data-testid into chat view source (minimum for smoke)

**Files:**
- Modify: `src/presentation/components/chat/chat-view.ts` (or whichever file builds the chat container — confirm via grep)
- Modify: the chat input + send button render code
- Modify: the message-renderer code (so each rendered message gets `data-testid` + `data-role` + `data-msg-id`)
- Modify: the new-chat button render code

**Approach:** add `el.setAttribute('data-testid', TestIds.chat.X)` next to each existing render call. Do NOT change CSS classes. Add `data-role="user"|"assistant"` on message elements alongside their existing class.

- [ ] **Step 1: Find the chat container element**

```bash
grep -rn "intelligence-assistant-chat-container\|ia-chat-container" \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/src \
  --include="*.ts" | head -10
```

Read the matching files. The chat container is created in `src/presentation/components/chat/chat-view.ts` (or a child of it).

- [ ] **Step 2: Add testid to the container**

In the file where the container is created (the element holding the entire chat view), find the line that creates the root `containerEl.createDiv({ cls: 'intelligence-assistant-chat-container' })` (or similar) and add a sibling line:

```ts
container.setAttribute('data-testid', TestIds.chat.container);
```

Add `import { TestIds } from '@/presentation/utils/test-ids';` (use whatever alias the file currently uses — match its other imports).

- [ ] **Step 3: Add testid to input/send/stop/new buttons + message list + empty state**

Repeat the same pattern for each of:

| TestIds key | Element |
|---|---|
| `TestIds.chat.input` | The chat textarea (currently `.chat-input`) |
| `TestIds.chat.sendBtn` | The send button (currently `.ia-send-btn`) |
| `TestIds.chat.stopBtn` | The stop button (currently `.stop-generation-btn`) |
| `TestIds.chat.newBtn` | The new-chat button |
| `TestIds.chat.emptyState` | The empty state element (currently `.ia-chat-empty-state`) |
| `TestIds.chat.messageList` | The message list container (currently `.ia-chat-messages`) |
| `TestIds.chat.modelSelect` | The model `<select>` |
| `TestIds.chat.modeSelect` | The mode (chat/agent) `<select>` |

Use grep + Read to locate each element's creation site, then Edit to add a single line setting the attribute. Keep classes untouched.

- [ ] **Step 4: Add testid + data-role + data-msg-id on each rendered message**

Find the message render function (`addMessageToUI` / `message-renderer.ts`). After the element is created and the role class is applied, add:

```ts
msgEl.setAttribute('data-testid', TestIds.chat.message);
msgEl.setAttribute('data-role', message.role);  // 'user' | 'assistant'
msgEl.setAttribute('data-msg-id', message.id);  // assumes Message.id exists
```

If `Message.id` doesn't exist or isn't accessible, fall back to `String(index)` from the iteration site. Confirm by Reading the `Message` type in `src/types/`.

- [ ] **Step 5: Run lint + build**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npm run lint 2>&1 | tail -10
npm run build 2>&1 | tail -10
```

Expected: both pass. If lint complains about untyped attribute or import path, fix in-place.

- [ ] **Step 6: Deploy to local Obsidian per CLAUDE.md**

```bash
node scripts/deploy.js --local
```

Expected: deploy success.

- [ ] **Step 7: Stage** (commit alongside Task 15)

```bash
git add src/
```

---

## Task 14: Add data-testid to settings shell (minimum for smoke; full coverage in P1)

**Files:**
- Modify: `src/presentation/components/tabs/index.ts` or whichever file builds the settings shell (the tabs strip)

For the smoke spec we only need the shell + tab elements to exist with testids. Provider/MCP/Agent forms get testids in P1.

- [ ] **Step 1: Locate the settings shell element**

```bash
grep -rn "settings-tab\|ia-settings\|SettingsShell\|displaySettingTab" \
  /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/src/presentation/components/tabs/ \
  --include="*.ts" | head -10
```

Read the file that renders the tabs list.

- [ ] **Step 2: Add testid to the shell container and each tab element**

For the shell root:

```ts
shellEl.setAttribute('data-testid', TestIds.settings.shell);
```

For each tab element (where the loop generates them):

```ts
tabEl.setAttribute('data-testid', TestIds.settings.tab);
tabEl.setAttribute('data-tab-id', tab.id);  // 'llm', 'mcp', etc.
```

- [ ] **Step 3: Lint + build + deploy**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -5
node scripts/deploy.js --local 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 4: Stage** (commit alongside Task 15)

```bash
git add src/
```

---

## Task 15: Write smoke spec and run it

**Files:**
- Create: `tests/e2e/specs/00-smoke.spec.ts`
- Delete: `tests/e2e/specs/.gitkeep`

The smoke spec must verify:
1. Plugin loads — `waitForPluginReady` succeeds
2. Chat view opens — `chatPage.open()` resolves
3. Sending a message with a mocked LLM produces user + assistant messages with the expected text
4. The conversation file is written to disk (verifies the persistence path is not stubbed)

- [ ] **Step 1: Implement the spec**

Write `tests/e2e/specs/00-smoke.spec.ts`:

```ts
import { ChatViewPage } from '../pages/chat/chat-view.page';
import { VaultFixture } from '../support/vault-fixture';
import { mockLLM } from '../support/mock-llm';
import { waitForPluginReady } from '../support/plugin-helpers';

describe('Smoke — plugin loads, chat round-trips, conversation persists', () => {
	const vault = new VaultFixture();
	const chat = new ChatViewPage();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
		await mockLLM.replyWith('pong from mock');
	});

	afterEach(async () => {
		await mockLLM.clearAll();
	});

	it('renders both messages and writes them to the conversation file', async () => {
		await chat.open();
		await chat.newChat();
		await chat.sendMessage('ping');
		await chat.waitForReplyComplete();

		const messages = await chat.getMessages();
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual({ role: 'user', text: 'ping' });
		expect(messages[1].role).toBe('assistant');
		expect(messages[1].text).toContain('pong from mock');

		const conversationId = await chat.getConversationId();
		expect(conversationId).not.toBe('');

		const conv = await vault.readDataFile<{ messages: Array<{ role: string; content: string }> }>(
			`data/conversations/${conversationId}.json`
		);
		expect(conv.messages).toHaveLength(2);
		expect(conv.messages[0].content).toBe('ping');
		expect(conv.messages[1].content).toContain('pong from mock');
	});
});
```

- [ ] **Step 2: Remove the .gitkeep**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git rm tests/e2e/specs/.gitkeep
```

- [ ] **Step 3: Run the smoke spec**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npm run test:e2e:smoke 2>&1 | tee /tmp/smoke-out.log | tail -50
```

Expected: 1 passing test. If it fails:

1. **`data/conversations/...` not found** → the actual conversation path may not be under `data/`. Re-grep:

   ```bash
   grep -rn "conversations/\|ConversationStorageService\|CONVERSATION" \
     /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant/src/application \
     --include="*.ts" | grep -i "path\|folder\|dir" | head -10
   ```

   Adjust the path in `vault.readDataFile(...)` to match.

2. **Selector not found (`ia-chat-...`)** → the source-side testid injection in Task 13 missed a spot. Inspect the live DOM via:

   ```bash
   npx wdio run tests/e2e/config/wdio.ci.conf.ts --spec='tests/e2e/specs/00-smoke.spec.ts' 2>&1 | grep -i "data-testid\|wait.*displayed"
   ```

3. **Mock not intercepting** → confirm `browser.mock` is supported by wdio-obsidian-service; if not, fall back to the `fetch`-patching pattern used by the deleted `mock-ai.ts`. The browser.mock route was already in use, so this should work.

Iterate until green. Each failure → fix → rerun cycle should be < 30 seconds.

- [ ] **Step 4: Commit Tasks 12–15 together**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
git add tests/e2e/pages/ tests/e2e/specs/00-smoke.spec.ts src/
git status   # confirm: pages/, specs/, src/ chat + settings changes, .gitkeep removed
git commit -m "$(cat <<'EOF'
test(e2e): green smoke spec — plugin loads, chat round-trips, persists

- BasePage exposes waitFor/click/type/getText keyed by data-testid only
- ChatViewPage uses Obsidian workspace API to open the view; assertions
  read messages by data-testid + data-role
- Source-side: chat container/input/send/stop/new/empty-state/message-list
  and each rendered message receive data-testid attributes (TestIds.chat.*)
- Settings shell + tab strip receive testids (full settings coverage
  comes in P1)
- 00-smoke.spec.ts asserts: 2 messages render, user text matches sent
  text, assistant text contains the mocked reply, and the conversation
  JSON on disk contains both messages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: README — slim e2e docs

**Files:**
- Modify: `tests/e2e/README.md` (rewrite — old one claims 270+ tests, false)

- [ ] **Step 1: Overwrite tests/e2e/README.md with a short, accurate doc**

Write:

```markdown
# E2E Tests

WebdriverIO + wdio-obsidian-service. Three layers:

| Suite | Command | What it does |
|---|---|---|
| Smoke | `npm run test:e2e:smoke` | Plugin loads, chat round-trips, conversation persists. < 30s. |
| CI    | `npm run test:e2e:ci`    | Smoke + functional (mocked LLM, mocked MCP, real persistence). < 5 min. |
| Release | `npm run test:e2e:release` | Real LLM and MCP. Requires `.env.test`. < 15 min. |

## Layout

```
tests/e2e/
├── config/             # wdio.ci.conf.ts, wdio.release.conf.ts
├── fixtures/
│   ├── responses/      # LLM HTTP response fixtures
│   └── vault-template/ # Fresh vault state copied per spec
├── pages/              # Page Objects (specs touch DOM only via these)
│   ├── base.page.ts
│   └── chat/chat-view.page.ts
├── support/
│   ├── testids.ts      # Re-exports src/presentation/utils/test-ids.ts
│   ├── vault-fixture.ts
│   ├── plugin-helpers.ts
│   └── mock-llm.ts
└── specs/
    ├── 00-smoke.spec.ts
    └── release/        # Real-API specs (skipped if .env.test missing)
```

## Conventions

- **Selectors:** `data-testid` only. New ids are added to `src/presentation/utils/test-ids.ts`; the test side re-exports.
- **Waits:** `browser.pause` is banned (ESLint enforced). Use `browser.waitUntil` or page object helpers.
- **Spec isolation:** `beforeEach { await vault.reset(); }`. No shared state.
- **Assertions:** verify specific values, not "something exists". `expect(messages).toHaveLength(2)`, not `expect(count).toBeGreaterThanOrEqual(0)`.
- **DOM access in specs:** banned (ESLint enforced). Specs only call page-object methods.

## Adding a spec

1. If you need a new UI element, add a `TestIds.<scope>.<name>` constant and set the attribute in the component.
2. Add a page-object method that exposes a domain action (`chatPage.attachFile(path)`), not a raw selector.
3. Each `it` starts from a clean vault via `VaultFixture.reset()`.
4. Assertions must check user-observable behavior AND, where applicable, on-disk state via `vault.readDataFile()`.

## Release suite

Set in `.env.test` at the repo root:

```env
E2E_TEST_PROVIDER=openai
E2E_TEST_API_KEY=sk-...
E2E_TEST_MODEL=gpt-4o-mini
```

Missing values → the release `onPrepare` is a no-op and specs that depend on real credentials should self-skip.
```

- [ ] **Step 2: Run lint + build one last time**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/README.md
git commit -m "$(cat <<'EOF'
docs(e2e): rewrite tests/e2e/README to match the new architecture

Replaces the inflated "270+ tests / 85% coverage" claim with an accurate
description of the three-suite pyramid, directory layout, the data-testid
discipline, and conventions for adding specs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 0 acceptance checklist

After all tasks are done, the executor should be able to confirm:

- [ ] `npm run test:e2e:smoke` exits 0 with 1 passing test in < 30s
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `git status` is clean
- [ ] `tests/e2e/utils/test-safety.ts` does not exist
- [ ] `grep -r "browser.pause" tests/e2e/` returns nothing
- [ ] `grep -r "\$('\|\\\$\\\$('" tests/e2e/specs/` returns nothing (no raw selectors in specs)
- [ ] No `*.log` files in the repo root or `tests/`
- [ ] No `*.backup` files in `src/`

When all of these hold, Phase 0 is done. The next planning step is to write `2026-05-24-e2e-rebuild-phase-1-chat-and-llm.md`, which layers:

- Full Chat suite (C1-C4, plus error handling and conversation isolation)
- LLM Provider CRUD with reload verification (L1-L3)
- Settings persistence (S1)
- Source-side testids for the LLM tab + provider modal

Phases 2 (Agent/MCP/RAG) and 3 (Release suite + CI workflow) follow.
