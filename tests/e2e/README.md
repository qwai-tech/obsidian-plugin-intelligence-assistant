# Actual Obsidian E2E tests

WebdriverIO and `wdio-obsidian-service` run the built plugin inside actual Obsidian. Services used by a test are a separate choice: the CI host is real while its LLM/MCP services are mocks.

| Command | Scope |
|---|---|
| `npm run test:e2e:smoke` | Actual host, deterministic mocked chat round-trip |
| `npm run test:e2e:ci` / `npm run test:e2e` | Actual host with mocked LLM/MCP; functional/persistence/UI checks |
| `npm run test:e2e:release` | Individual configured real specs; inspect missing-environment skips and opt-ins |
| `npm run verify:release:real` | Four mandatory real cases on one committed, frozen production bundle; no mandatory skips/spec retries |
| `npm run test:e2e:tour` | Host screenshots for review; backend scope depends on the tour configuration |

For a no-mock task, use the applicable real route, not smoke/CI. The complete real gate's default long task requires at least 20 minutes of actual execution, so a claimed “under 15 minutes” target does not apply. See [testing and evidence](../../docs/reference/testing.md).

## Layout

- `config/`: CI, release, long-task and tour configurations.
- `fixtures/vault-template/`: saved legacy-style settings used to exercise actual migration on startup.
- `pages/`: chat, editor and settings page objects.
- `support/testids.ts`: re-exports [`src/ui/utils/test-ids.ts`](../../src/ui/utils/test-ids.ts).
- `support/vault-fixture.ts`: template reset, real provider seeding, runtime settings/data helpers and source resynchronization.
- `support/plugin-helpers.ts`: actual plugin readiness and disable/enable reload.
- `support/release-evidence.ts`: actual installed hashes, saved products, conversations, journals and screenshots.
- `support/release-long-vault.ts`: actual vault reads and real-checker registration checks.
- `support/mock-llm*`, `mock-mcp-server.js`: CI-only deterministic services, not real-release evidence.
- `specs/`: host tests grouped by feature; `specs/release/` contains real-provider cases.

## Fixtures and persistence

`wdio-obsidian-service` clones the input vault and installs the configured plugin files in its actual runtime vault. Read runtime state through the host adapter/helpers, not the repository template when claiming a saved result.

The legacy `config/user/settings.json` template migrates to format-2 `data.json`; successful migration removes the old file. `VaultFixture.seedSettings` updates actual plugin state and synchronizes source definitions so newly configured tools are registered. Do not confuse registry reload with source registration.

A template reset affects the fixture's runtime subdirectories. It must not delete installed `main.js`, `styles.css` or `manifest.json`. Release seeding replaces the mock provider list entirely with the real configured connection, including its instance-scoped model identity. Optional specs that skip without credentials do not constitute a complete release gate.

## Assertions and diagnostics

Prefer page-object actions and stable test IDs. Wait for an observable condition rather than timing a partial reply with a blind pause. For slow specs, set the suite's inherited timeout before WDIO wraps the test; changing only `this.timeout` inside `it` does not extend an already captured outer timeout.

Check actual files, persisted settings and typed terminal outcomes. A pending proposal is not a committed note, and a budget stop is not an `answered` task. The complete long case captures contents/hashes before deleting owned test notes; its after-test screenshot may show the cleaned file sidebar. Product captures retain the real pre-cleanup files.

CI diagnostics may query the mock admin server. Complete real-release diagnostics explicitly avoid that branch. Real cases save fresh JUnit, actual screenshots, conversations and JSONL journals under their run ID. Do not publish secrets or unredacted runtime settings in logs.

## CI-only mock control

The CI config starts `mock-llm-server.ts`; mock specs can queue responses and hold/release a stream deterministically. This is valuable for reproducible unit/host behavior, but is not a real model acceptance test. Do not execute it in a session that prohibits mocks.

Real optional MCP/Ollama specs require their own actual service/model setup and have separate scope from the four-case complete release gate. Current release preparation excludes Ollama and live SAP calls; see [version status](../../docs/releases/0.1.0.md).
