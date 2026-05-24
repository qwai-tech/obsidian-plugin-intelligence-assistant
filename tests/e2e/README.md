# E2E Tests

WebdriverIO + wdio-obsidian-service. Three layers:

| Suite | Command | What it does |
|---|---|---|
| Smoke | `npm run test:e2e:smoke` | Plugin loads; chat view renders with all anchor testids; vault state resets between specs. Foundation gate. Runs in ~2s. |
| CI    | `npm run test:e2e:ci`    | Smoke + functional specs (mocked LLM, mocked MCP, real persistence). Target < 5 min. |
| Release | `npm run test:e2e:release` | Real LLM and MCP. Requires `.env.test`. Target < 15 min. |

Phase 0 (foundation) is done. Phases 1–3 are documented in
`docs/superpowers/specs/2026-05-24-e2e-rebuild-design.md` and will add
chat round-trip, LLM/MCP CRUD with persistence verification, the agent
tool-call loop, RAG, and the release suite.

## Layout

```
tests/e2e/
├── config/             # wdio.ci.conf.ts, wdio.release.conf.ts
├── fixtures/
│   ├── responses/      # LLM HTTP response fixtures (used by Phase 1+)
│   └── vault-template/ # Fresh vault state copied per spec
├── pages/              # Page Objects (specs touch DOM only via these)
│   ├── base.page.ts
│   └── chat/chat-view.page.ts
├── support/
│   ├── testids.ts      # Re-exports src/presentation/utils/test-ids.ts
│   ├── vault-fixture.ts
│   ├── plugin-helpers.ts
│   └── mock-llm.ts     # Wraps browser.mock; usable once Bidi works (Phase 1)
└── specs/
    ├── 00-smoke.spec.ts
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
4. Assert on user-observable behavior AND, where applicable, on-disk
   state via `vault.readDataFile()`.

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

## Known limitation (Phase 0)

`browser.mock` requires WebDriver Bidi, which currently fails to
initialize under wdio-obsidian-service's launch path. Phase 1 will
introduce an alternate LLM-mocking layer (fetch monkey-patch in the
Electron renderer, or a small local stub HTTP server) so the chat
round-trip assertion can land without depending on Bidi.
