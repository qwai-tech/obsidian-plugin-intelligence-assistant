# E2E Tests

WebdriverIO + wdio-obsidian-service. Three layers:

| Suite | Command | What it does |
|---|---|---|
| Smoke | `npm run test:e2e:smoke` | Plugin loads; chat view renders with all anchor testids; vault state resets between specs; mocked chat round-trip renders and persists. Foundation gate. Runs in ~2s. |
| CI    | `npm run test:e2e:ci`    | Smoke + functional specs (mocked LLM, mocked MCP, real persistence). Target < 5 min. |
| Release | `npm run test:e2e:release` | Real LLM and MCP. Requires `.env.test`. Target < 15 min. |

Phases 0–2 are done: the Bidi-free local LLM mock, chat, settings,
Agentic Agent, MCP, RAG, Tools, Prompts, Quick Actions, and editor
quick-action coverage are in place. Phase 3 adds the real-provider
release suite and CI wiring.

## Layout

```
tests/e2e/
├── config/             # wdio.ci.conf.ts, wdio.release.conf.ts
├── fixtures/
│   ├── responses/      # LLM HTTP response fixtures (used by Phase 1+)
│   └── vault-template/ # Fresh vault state copied per spec
├── pages/              # Page Objects (specs touch DOM only via these)
│   ├── base.page.ts
│   ├── chat/chat-view.page.ts
│   ├── editor/editor-page.ts
│   └── settings/
│       ├── agents-settings.page.ts
│       ├── general-settings.page.ts
│       ├── mcp-settings.page.ts
│       ├── prompts-settings.page.ts
│       ├── quick-actions-settings.page.ts
│       ├── rag-settings.page.ts
│       ├── tools-settings.page.ts
│       └── llm-settings.page.ts
├── support/
│   ├── testids.ts      # Re-exports src/presentation/utils/test-ids.ts
│   ├── vault-fixture.ts
│   ├── diagnostics.ts  # Failure screenshots, plugin tree, mock call capture
│   ├── plugin-helpers.ts
│   ├── mock-llm-server.ts # Local OpenAI-compatible stub HTTP server
│   ├── mock-mcp-server.js # CI stdio MCP server
│   ├── release-env.ts  # .env.test loading + release skip helpers
│   └── mock-llm.ts     # Admin client for queued replies and request capture
└── specs/
    ├── 00-smoke.spec.ts
    ├── agents/
    ├── editor/
    ├── rag/
    ├── chat/
    ├── settings/
    └── release/        # Real LLM/MCP specs; skip cleanly without env
```

## Conventions

- **Selectors:** `data-testid` only. New ids go in
  `src/presentation/utils/test-ids.ts`; the test side re-exports.
- **Waits:** `browser.pause` is banned (ESLint-enforced in
  `tests/e2e/**`). Use `browser.waitUntil(condition)` or page-object
  helpers like `chat.waitForReplyComplete()`.
- **Spec isolation:** `beforeEach { await vault.reset(); }`. The reset
  rebuilds the plugin's `config/` and `data/` subdirs from the template
  without touching `main.js`/`manifest.json` (which wdio-obsidian-service
  installs once at session start).
- **Assertions:** specific values, not "something exists". Prefer
  `expect(messages).toHaveLength(2)` over
  `expect(count).toBeGreaterThanOrEqual(0)`.
- **Spec size:** spec files warn over 100 logical lines. Split long flows
  by user outcome rather than growing a single scenario file.
- **DOM access in specs:** banned. ESLint blocks raw `$(`/`$$(` in
  `tests/e2e/specs/**`. Add a domain method to the page object instead.
- **No silent failures:** there is no `safeTest`/`safeClick`/`isVisible`
  with swallowed errors. If a thing isn't there, the spec must fail
  loudly.

## Adding a spec

1. If the UI needs a new selector, add a `TestIds.<scope>.<name>`
   constant and set the attribute in the matching component file.
2. Add a page-object method that exposes a domain action
   (`chatPage.attachFile(path)`), not a raw selector.
3. Start the spec with `await vault.reset()` in `beforeEach`.
4. Assert on user-observable behavior AND, where applicable, persisted
   runtime state via `vault.readRuntimeDataFile()`. Use
   `vault.readDataFile()` only for template/reset assertions on the
   repository-side fixture files.

## Mock LLM

The CI suite starts `tests/e2e/support/mock-llm-server.ts` in
`wdio.ci.conf.ts` before Obsidian launches. The seeded OpenAI provider
in `fixtures/vault-template/.../settings.json` points at
`http://127.0.0.1:43117/v1`, so the plugin uses its normal network path.

Specs queue responses through `mockLLM`:

```ts
await mockLLM.clearAll();
await mockLLM.replyWith('pong');
```

The server supports normal JSON completions, OpenAI-style SSE streaming
for `stream: true` requests, optional delayed chunks for incremental UI
assertions, CORS preflight, error status responses, and request capture
through `mockLLM.getCalls()`.

## Release suite

Set in `.env.test` at the repo root:

```env
E2E_TEST_PROVIDER=openai
E2E_TEST_API_KEY=sk-...
E2E_TEST_MODEL=openai:gpt-4o-mini

# Optional for OpenAI-compatible endpoints.
E2E_TEST_BASE_URL=https://api.openai.com/v1

# Required only for release/real-mcp.spec.ts.
E2E_TEST_MCP_NAME=release-mcp
E2E_TEST_MCP_COMMAND=node
E2E_TEST_MCP_ARGS=/absolute/path/to/server.js
E2E_TEST_MCP_TOOL_NAME=vault_echo
E2E_TEST_MCP_TOOL_ARGS='{"text":"release"}'
E2E_TEST_MCP_EXPECTED_TEXT=release
```

`tests/e2e/support/release-env.ts` loads `.env.test` before seeding the
release provider. Missing real-provider values make the real LLM specs
self-skip. Missing MCP values make only `release/real-mcp.spec.ts`
self-skip.

GitHub Actions release secrets checklist:

- `E2E_TEST_PROVIDER`
- `E2E_TEST_API_KEY`
- `E2E_TEST_MODEL`
- Optional: `E2E_TEST_BASE_URL`
- For real MCP: `E2E_TEST_MCP_NAME`, `E2E_TEST_MCP_COMMAND`,
  `E2E_TEST_MCP_ARGS`, `E2E_TEST_MCP_TOOL_NAME`,
  `E2E_TEST_MCP_TOOL_ARGS`, `E2E_TEST_MCP_EXPECTED_TEXT`

The `e2e-release` workflow runs on pushes to `main` and tag pushes. The
regular mocked `e2e-ci` workflow runs on every push and pull request.

## Diagnostics

WDIO writes JUnit XML to `tests/e2e/reports/junit/`. On a failed spec it
also captures:

- `tests/e2e/screenshots/{spec}/{test}.png`
- `tests/e2e/state-dumps/{spec}/{test}.plugin-tree.txt`
- `tests/e2e/logs/{spec}/{test}.mock-calls.json`
- `tests/e2e/logs/{spec}/{test}.failure.json`

GitHub Actions uploads those directories on failure for both CI and
release E2E jobs.

To verify the release skip path on a machine that already has
`.env.test`, run with `E2E_TEST_DISABLE_DOTENV=1` and empty
`E2E_TEST_*` variables.

## Known Limitations

The local mock currently covers `/v1/chat/completions`, `/v1/models`,
and `/v1/embeddings`. Add endpoints explicitly as specs need them.
