# E2E Test Suite & Tool System Refactor — Backlog

Tracks unfinished work after Phase 0 (E2E foundation) and the Phase 5
cleanup that finished the tool-system-refactor.

Source of truth for principles: `docs/superpowers/specs/2026-05-24-e2e-rebuild-design.md`.
Phase 0 plan + acceptance: `docs/superpowers/plans/2026-05-24-e2e-rebuild-phase-0-foundation.md`.
Tool system Phase 5 cleanup: `docs/superpowers/plans/2026-05-25-tool-system-refactor-5-cleanup.md`.

## Tool system follow-ups (after Phase 5 cleanup)

- [x] **Agent-edit-modal: native toolAccess editor.** (`23814e8`)
  Phase 5 kept the
  modal's UI working state on the legacy `enabledBuiltInTools` /
  `enabledMcpServers` / `enabledMcpTools` / `enabledCLITools` /
  `enabledAllCLITools` arrays for minimal-risk reasons; it recomputes
  `toolAccess` on save. Build a real toolAccess editor (per-source
  'all' vs explicit toolId list, with disambiguation visible to the
  user) and drop the legacy arrays from `types/core/agent.ts` entirely.
- [x] **Drop the 5 legacy fields from the Agent type.** (`36c40e3`)
  After the modal
  rewrite, remove `enabledBuiltInTools?`/`enabledMcpServers?`/
  `enabledMcpTools?`/`enabledCLITools?`/`enabledAllCLITools?` and the
  defensive `??= []` defaulting in `agents-tab.ts` lines 128-129.
- [x] **Persist write-side schema unification.** (`58541c3`)
  `userConfigToPluginSettings`
  reads from both old `config.mcp.*` + `config.tools.*` paths but the
  inverse mapper (`pluginSettingsToUserConfig`) should write only the
  new schema. Verify and clean up.

---

## P0 follow-ups (carried over from Phase 0)

These are concrete debts the Phase 0 rebuild took on knowingly.

- [x] **Replace `browser.mock` with a Bidi-free LLM mocking layer.**
  (`aed96e9`, `d200806`, `25082a4`, `3290d48`)
  CI now starts a local OpenAI-compatible HTTP stub server from
  `wdio.ci.conf.ts`, points the seeded provider at
  `http://127.0.0.1:43117/v1`, and keeps the public `mockLLM`
  queueing API. The follow-up `3290d48` added browser CORS preflight
  support and automatic JSON-to-SSE conversion for `stream: true`
  requests.

- [x] **Add the deferred chat round-trip assertion to the smoke spec.**
  (`6c899b9`)
  Smoke now sends "ping", queues "pong", asserts both messages render,
  reads the persisted runtime conversation through Obsidian's vault
  adapter, and verifies the main streaming chat request body.

- [x] **Resolve the two pre-existing branch modifications.** (chat-controller
  resolved by Phase 5 Stage C; the test-vault/settings.json runtime-mutation
  remains untracked and is normal — it gets reset by VaultFixture on every
  spec run.)

- [x] **Triage the 32 pre-existing lint errors / 32 warnings on the
      `tool-system-refactor` branch.** (`8a0363d`)
  Phase 0 preserved the baseline
  but did not fix it. Many are `@typescript-eslint/no-unsafe-*` and
  `@typescript-eslint/no-explicit-any` in plugin source. Decide whether
  to (a) clear them before merging the E2E work, (b) tighten ESLint
  later in a separate cleanup PR, or (c) accept the noise. Blocking
  lint errors are now cleared; remaining sentence-case findings stay at
  warning level for a focused UI-copy cleanup.

- [x] **Conversation file lookup helper.** (`04d9cf3`)
  Conversation filenames follow
  `{datePrefix}-{seq:000}-{sanitizedId}.json`. Specs that need to read
  a conversation by id currently have to walk the index first. Add
  `VaultFixture.findConversationFile(id)` → file path, so Phase 1+
  specs stay terse.

---

## Phase 1 — Chat + LLM Provider CRUD + Settings persistence

Target: ~2 days. Plan doc: `2026-05-24-e2e-rebuild-phase-1-chat-and-llm.md` (to write).

### Specs to add

- [ ] **`chat/send-receive.spec.ts`** — mocked reply round-trip with
      persistence assertions (C1).
- [x] **`chat/streaming.spec.ts`** (`fee40fc`) — SSE chunks render
      incrementally; assistant text matches concatenated chunks (C1).
- [x] **`chat/stop-generation.spec.ts`** (`562804d`) — stop
      mid-stream; streaming flag false; partial content kept (C2).
- [x] **`chat/conversation-persistence.spec.ts`** (`b82459a`) —
      send → reload plugin (`reloadPlugin()`) → latest conversation
      re-opens with persisted messages.
- [ ] **`chat/conversation-isolation.spec.ts`** — create conv A; create
      conv B; switching back to A shows only A's history (C3).
- [x] **`chat/model-switch.spec.ts`** (`9050873`) — change model in
      selector → next request body has the chosen `model` field (C4).
- [x] **`chat/error-handling.spec.ts`** (`d7be052`) — mock 500 →
      error surface in UI and persisted failed assistant message; no
      silent swallowing.

- [ ] **`settings/llm-provider-crud.spec.ts`** — full Create → Read →
      Update → reload plugin → Delete loop with both UI list assertion
      AND `llm-providers.json` on-disk assertion at each step (L1).
- [ ] **`settings/llm-model-refresh.spec.ts`** — refresh provider
      models → mocked `/v1/models` returns N → `cache/llm_models.json`
      contains them and `cacheTimestamp` updated (L2).
- [ ] **`settings/settings-persistence.spec.ts`** — toggle assorted
      settings → `reloadPlugin()` → settings preserved (S1).

### Source-side testids needed

- [ ] LLM tab: add-provider button, provider rows (with
      `data-provider-id`), edit/delete per-row buttons.
- [ ] Provider config modal: `name`, `apiKey`, `baseUrl`,
      `cachedModels` table, save/cancel/test-connection.
- [ ] Conversation list sidebar: items (with `data-conv-id`),
      delete/rename actions.

### Infrastructure

- [ ] `tests/e2e/support/data-fixtures.ts` — factory functions
      `createProviderConfig({...})`, `createAgentConfig({...})`,
      `createMcpServerConfig({...})` for seeding settings.json
      programmatically.
- [ ] `VaultFixture.reset('with-multi-provider' | ...)` — named
      profiles when specs need richer baseline state than the default
      template.
- [x] First-class request-capture in `mockLLM.getCalls()`.
      (`d200806`, exercised by `6c899b9`) Specs can inspect the
      model, messages, streaming flag, and headers the plugin actually
      sent.

---

## Phase 2 — Agent / MCP / RAG / Tools

Target: ~2 days. Plan doc: `2026-05-24-e2e-rebuild-phase-2-agent-mcp-rag.md` (to write).

### Agent

- [ ] **`agents/tool-call-loop.spec.ts`** (★ centerpiece) — agent mode,
      mock LLM scenario [tool_call → text], execution trace shows the
      tool invocation + result, final reply contains the tool's
      sentinel value, second LLM call body contains the tool result
      message (A2).
- [ ] **`agents/tool-permission-isolation.spec.ts`** — agent whitelists
      tool X only; LLM tries to call tool Y; registry blocks → trace
      shows rejection, not "UI didn't crash" (A3).
- [ ] **`agents/max-steps.spec.ts`** — agent with maxSteps=2 →
      infinite-loop mock → execution halts at step 2, user is notified.
- [ ] **`settings/agents-crud.spec.ts`** — create/read/update/delete
      agents with reload-plugin verification; `data/agents/{id}.json`
      on disk (A1).

### MCP

- [ ] **`tests/e2e/support/mock-mcp-server.js`** — ~100-line Node
      stdio JSON-RPC server implementing `initialize` / `tools/list`
      / `tools/call` / `shutdown`. Used by CI so we don't need
      `npx`/`uvx`/`docker` available.
- [ ] **`settings/mcp-crud.spec.ts`** — add server, connect,
      `cache/mcp-tools/<name>.json` appears with expected tool names
      (M1).
- [ ] **`agents/mcp-tool-call.spec.ts`** — agent + MCP-sourced tool
      invoked through the loop (M2).

### RAG

- [ ] **`rag/indexing.spec.ts`** — point RAG at a 3-note mini-vault
      under `fixtures/vault-template/`, trigger reindex, mocked
      `/v1/embeddings` returns deterministic vectors,
      `data/vector_store/notes.json` exists and contains chunks (R1).
- [ ] **`rag/retrieval-context.spec.ts`** — enable RAG, send query,
      assert `message.ragSources[]` populated and the cited paths
      match the indexed files (R2).

### Tools

- [ ] **`settings/tools-builtin.spec.ts`** — enable/disable built-in
      tools; agent-side filtering respects the enable flag.
- [ ] **`settings/tools-openapi-import.spec.ts`** — paste/upload
      OpenAPI JSON → tool registered → appears in agent tool picker;
      `data/openapi-tools/{id}.json` written.
- [ ] **`settings/tools-cli-config.spec.ts`** — add CLI tool with arg
      template; persistence verified.

### Prompts & Quick Actions

- [ ] **`settings/prompts-crud.spec.ts`** — CRUD on system prompts;
      `data/prompts/{id}.json` verified.
- [ ] **`settings/quickactions-crud.spec.ts`** — CRUD on quick
      actions; `settings.quickActions` array updated.
- [ ] **`editor/quick-action.spec.ts`** — select editor text →
      right-click quick action → mocked LLM returns rewritten text →
      editor selection replaced (Q1).

---

## Phase 3 — Release suite + CI integration

Target: ~0.5 days. Plan doc: `2026-05-24-e2e-rebuild-phase-3-release-and-ci.md` (to write).

### Release specs (real API)

- [ ] **`release/real-chat.spec.ts`** — real LLM, single round-trip,
      assert non-empty reply, log token usage.
- [ ] **`release/real-agent.spec.ts`** — real LLM, agent mode, ask
      something requiring a tool call (e.g. "read README.md and
      summarize"); assert tool was invoked + final reply references
      file content.
- [ ] **`release/real-mcp.spec.ts`** — real MCP server (e.g. the
      Claude Code CLI or `mcp-server-filesystem`); assert
      tools/list response and a successful tool call round-trip.

### Env handling

- [ ] Release specs self-skip cleanly when `.env.test` env vars are
      missing (`describe.skip` or per-spec `this.skip()` after
      `before` env check). Document required env vars in
      `tests/e2e/README.md`.

### CI workflow

- [ ] **`.github/workflows/e2e.yml`** — two jobs:
  - `ci-e2e` on every push/PR: `npm ci && npm run build &&
    npm run test:e2e:ci`. Artifact: screenshots/state-dumps on failure.
  - `release-e2e` on push to `main` and on tag pushes: requires
    `E2E_TEST_*` secrets, runs `npm run test:e2e:release`.
- [ ] GitHub Actions secret setup checklist documented in
      `tests/e2e/README.md`.

---

## Cross-cutting infrastructure debt

- [ ] **Failure diagnostics.** On spec failure, dump: (a) screenshot
      to `tests/e2e/screenshots/{spec}/{test}.png`, (b) current
      `LIVE_PLUGIN_DIR` file tree, (c) last N captured mock calls.
      Add via `afterTest` hook.
- [ ] **Reporters.** Add `junit` reporter for CI consumption + optional
      `allure` for richer local debugging.
- [ ] **Assertion-strength ESLint rule.** Forbid trivially-true
      patterns in spec files:
  - `expect(...).toBeGreaterThanOrEqual(0)`
  - `expect(typeof x).toBe('string')` for `x` known to be a string
  - `expect(Array.isArray($$(...)))`
  Use custom AST selectors in the existing
  `no-restricted-syntax` config for `tests/e2e/specs/**`.
- [ ] **Spec length cap.** Lint warning if any spec file exceeds 100
      lines (signal that the `it` blocks are bundling too many
      concerns — split).
- [ ] **Page-object base helper coverage.** Add `BasePage.expectVisible(id)`
      and `BasePage.expectAbsent(id)` shortcuts that combine the
      wait + assertion with a clearer failure message than the raw
      `isDisplayed()` chain.

---

## Out of scope for this rebuild track

Captured here so they don't sneak back as Phase X items — each needs
its own initiative if pursued.

- Accessibility audit (ARIA, keyboard nav, contrast) — separate spec
- Visual regression / screenshot diff — separate tool & spec
- Performance benchmarks (startup, streaming throughput, large
  message handling) — separate harness
- Workflow editor coverage — was explicitly excluded from the
  rebuild design because the feature is not on a critical user path
- Mobile responsiveness — plugin is desktop-only per manifest
- Cross-browser (Chrome, Firefox) — Obsidian uses Electron Chromium

---

## How to use this backlog

- Each `[ ]` is intended to be a single-PR-sized chunk.
- Phase boundaries are advisory, not strict; pick whichever P-follow-up
  unblocks the most other items next (likely the LLM-mock replacement).
- When picking up an item, write a plan doc under
  `docs/superpowers/plans/` matching the date and topic before coding.
- Mark items done by checking the box and dropping the commit hash
  next to them, e.g.:
  - [x] **...** (`abc1234`)
