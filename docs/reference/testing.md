# Testing

Every change goes through the same layers, cheapest first. `npm run verify` runs the static checks, the Jest suites with coverage thresholds and the build in one command; CI runs it before every release.

| Layer | What it proves | Command | Runs in CI |
|-------|----------------|---------|------------|
| Lint | Code style, Obsidian guidelines (`eslint-plugin-obsidianmd`), the layering rules between `core`, `features`, `adapters`, `ui` and `bootstrap`, no `export *`, no global `app`, no debug logging, no HTML headings in settings or modals | `npm run lint` | Verification gate |
| Typecheck | The whole tree compiles, unit tests and e2e included (`tsconfig.json` for the source, `tsconfig.test.json` for the Jest tests) | `npm run typecheck` | Verification gate |
| Unit tests | Pure logic and components with the Obsidian API mocked (`__mocks__/obsidian.ts`) | `npx jest src packages` | Verification gate |
| Agent missions | The agent loop end to end against a mock LLM server and an in-memory vault: tool calls, write proposals, permissions, step budgets, stop, error recovery | `npm run test:missions` | Verification gate |
| Perf | Agent efficiency baseline (turns and tool calls per scenario), timing record, memory growth under forced GC | `npm run test:perf`, `npm run test:perf:mem` | Verification gate |
| Coverage | Per-layer floors so coverage cannot quietly drop (`coverageThreshold` in `jest.config.js`) | `npx jest --coverage` | Verification gate |
| Flake soak | Missions repeated until every run is identical | `npm run test:flake-soak` | Verification gate |
| Mutation | The agent orchestration core's tests catch injected faults (Stryker) | `npm run test:mutation` | Verification gate |
| API audit | No regressions in which Obsidian APIs the plugin depends on | `npm run audit:obsidian-api` | Verification gate |
| E2E | The built plugin inside real Obsidian (pinned version) with a mock LLM and a mock MCP server: chat, streaming, stop, agents, tools, MCP, RAG, settings persistence, secret storage, startup budget | `npm run test:e2e` | E2E workflow |
| Release E2E | Real provider, real MCP server, long and large agent tasks | `npm run test:e2e:release` (needs `.env.test`) | Manual |
| Real Ollama E2E | Against a local Ollama (`qwen3.5:0.8b`, `qwen3.5:2b`): saving and inserting a just-streamed reply, an image reaching a vision model, an agent's fixed model winning over the chat picker. Skips when the models are missing; override with `E2E_OLLAMA_URL`, `E2E_OLLAMA_CHAT_MODEL`, `E2E_OLLAMA_FIXED_MODEL` | `npx wdio run tests/e2e/config/wdio.release.conf.ts --spec tests/e2e/specs/release/real-ollama.spec.ts` | Manual |
| Visual tour | Screenshots of every screen and main dialog in the dark and light theme, saved to `tests/e2e/screenshots/tour/` for review | `npm run test:e2e:tour` | Manual |

Measured performance and the options behind the current choices are in [performance.md](performance.md).

## Where tests live

- `src/**/__tests__/`, `packages/obsidian-llm/src/__tests__/` — unit tests next to the code.
- `tests/harness/` — the mission runner, mock LLM harness and in-memory vault; `tests/missions/` — the missions.
- `tests/perf/` — efficiency, timing and memory suites (`efficiency.baseline.json` holds the agreed baseline; regenerate with `UPDATE_PERF_BASELINE=1`).
- `tests/e2e/` — WebdriverIO specs, page objects and support code; see [tests/e2e/README.md](../../tests/e2e/README.md).
- `tests/mutation/` — Stryker configuration notes; see [tests/mutation/README.md](../../tests/mutation/README.md).

## Writing tests

- Write the failing test first, then the change.
- Unit tests import the module under test directly; everything else imports features through their `index.ts`.
- Mission and Jest tests get their own mock LLM port from the OS, so suites can run in parallel.
- User-visible text goes through `t()`: `src/__tests__/i18n/untranslated-ui-strings.test.ts` fails on a hard-coded label, notice or placeholder in `src/ui`, `src/bootstrap` or `src/adapters`, and `locale-coverage.test.ts` requires every key in all 49 locales.
- E2E specs drive the UI through page objects and `data-testid`s, wait on conditions rather than sleeping (lint enforces it), and check persisted state in `data.json` with `VaultFixture.waitForSettings`.
- To assert on a partial stream, hold it with `mockLLM.streaming(chunks, { holdAfter })` and release it with `mockLLM.releaseStream()` instead of relying on timing.
- The e2e vault template keeps the settings layout of older versions, so every e2e run also exercises the settings migration.

## Before a commit

```bash
npm run verify
node scripts/deploy.js --local
npm run test:e2e
```
