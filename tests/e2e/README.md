# E2E Tests

WebdriverIO + wdio-obsidian-service. Three layers:

| Suite | Command | What it does |
|---|---|---|
| Smoke | `npm run test:e2e:smoke` | Plugin loads; chat view renders with all anchor testids; vault state resets between specs; mocked chat round-trip renders and persists. Foundation gate. Runs in ~2s. |
| CI    | `npm run test:e2e:ci`    | Smoke + functional specs (mocked LLM, mocked MCP, real persistence). Target < 5 min. |
| Release | `npm run test:e2e:release` | Real LLM and MCP. Requires `.env.test`. Target < 15 min. |

Phase 0 (foundation) is done. The Bidi-free local LLM mock and smoke
chat round-trip are in place. Phases 1–3 are documented in
`docs/superpowers/specs/2026-05-24-e2e-rebuild-design.md` and will add
LLM/MCP CRUD with persistence verification, the agent tool-call loop,
RAG, and the release suite.

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
│   └── settings/llm-settings.page.ts
├── support/
│   ├── testids.ts      # Re-exports src/presentation/utils/test-ids.ts
│   ├── vault-fixture.ts
│   ├── plugin-helpers.ts
│   ├── mock-llm-server.ts # Local OpenAI-compatible stub HTTP server
│   └── mock-llm.ts     # Admin client for queued replies and request capture
└── specs/
    ├── 00-smoke.spec.ts
    ├── chat/
    │   ├── conversation-isolation.spec.ts
    │   ├── conversation-persistence.spec.ts
    │   ├── error-handling.spec.ts
    │   ├── model-switch.spec.ts
    │   ├── send-receive.spec.ts
    │   ├── stop-generation.spec.ts
    │   └── streaming.spec.ts
    ├── settings/
    │   ├── llm-model-refresh.spec.ts
    │   └── llm-provider-crud.spec.ts
    └── release/        # Real-API specs (Phase 3)
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
E2E_TEST_MODEL=gpt-4o-mini
```

Missing values → the release `onPrepare` is a no-op and the seeded test
provider is used instead. Specs that strictly require real credentials
should self-skip via env checks (Phase 3).

## Known Limitations

The local mock currently covers `/v1/chat/completions` and `/v1/models`.
Add endpoints explicitly as specs need them, for example `/v1/embeddings`
for RAG indexing.
