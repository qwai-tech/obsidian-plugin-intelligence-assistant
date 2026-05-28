# E2E Rebuild Phase 3 — Release Suite and CI Integration

## Objective

Finish the L3 release layer from
`docs/superpowers/specs/2026-05-24-e2e-rebuild-design.md`: keep the
mocked CI suite fast and deterministic, and add an opt-in release suite
that exercises a real LLM provider and a real MCP subprocess when
credentials are configured.

## Scope

- Add release specs under `tests/e2e/specs/release/`.
- Load `.env.test` and GitHub `E2E_TEST_*` secrets consistently.
- Make missing release credentials skip cleanly, not fail CI.
- Wire GitHub Actions jobs for mocked CI E2E and real release E2E.
- Document required local env vars and GitHub secrets.
- Mark Phase 3 done in `docs/project/e2e-backlog.md` after validation.

## File-Level Plan

### 1. Release Environment Helper

- Create `tests/e2e/support/release-env.ts`.
- Responsibilities:
  - Read `.env.test` from repo root.
  - Preserve already-set process env values so GitHub secrets win.
  - Expose `getReleaseEnv()`.
  - Expose `skipUnlessReleaseLLM(this)` for real LLM specs.
  - Expose `skipUnlessReleaseMcp(this)` for real MCP specs.
- Modify `tests/e2e/support/vault-fixture.ts` so
  `seedReleaseProvider()` uses this helper and writes one configured
  provider into `config/user/settings.json`.

### 2. Real LLM Release Specs

- Create `tests/e2e/specs/release/real-chat.spec.ts`.
  - Skip unless `E2E_TEST_PROVIDER`, `E2E_TEST_API_KEY`, and
    `E2E_TEST_MODEL` exist.
  - Open chat, send a sentinel prompt, assert a non-empty reply
    containing the sentinel, and log token usage when persisted.
- Create `tests/e2e/specs/release/real-agent.spec.ts`.
  - Skip unless real LLM env exists.
  - Seed an active agent with built-in tool access.
  - Ask it to read `test-note.md`.
  - Assert the trace includes `read_file` and `AGENT_TOOL_SENTINEL`, and
    the final reply references the sentinel.

### 3. Real MCP Release Spec

- Create `tests/e2e/specs/release/real-mcp.spec.ts`.
- Skip unless real LLM env plus MCP env exists:
  - `E2E_TEST_MCP_COMMAND`
  - `E2E_TEST_MCP_TOOL_NAME`
- Add and connect the MCP server through the MCP settings UI.
- Assert `data/mcp-servers.json` includes the listed tool.
- Execute the configured MCP tool through `ToolRegistry.executeTool()`.
- Assert the tool execution succeeds and contains
  `E2E_TEST_MCP_EXPECTED_TEXT` when configured.

### 4. CI Workflow

- Modify `.github/workflows/e2e.yml`.
- `e2e-ci`:
  - Run on every push and pull request.
  - Execute `npm ci`, `npm run build`, `npm run test:e2e:ci`.
  - Upload E2E diagnostic artifact paths on failure.
- `e2e-release`:
  - Run on pushes to `main` and tag pushes.
  - Execute `npm ci`, `npm run build`, `npm run test:e2e:release`.
  - Pass all `E2E_TEST_*` secrets through the environment.
  - Upload E2E diagnostic artifact paths on failure.

### 5. Documentation

- Modify `tests/e2e/README.md`.
- Document:
  - current suite layout,
  - `.env.test` release variables,
  - GitHub Actions secret checklist,
  - release skip behavior.

### 6. Backlog Sync

- Modify `docs/project/e2e-backlog.md`.
- Mark Phase 3 release specs, env handling, CI workflow, and secret
  checklist complete only after validation passes.

## Validation

Run:

```bash
npm run type-check
npm run lint
npm run build
npm run test:e2e:release
```

Expected release validation without `.env.test`: specs skip cleanly and
the command exits 0.

Run the mocked CI suite after any source/test changes that affect shared
E2E helpers:

```bash
npm run test:e2e:ci
```

Always restore the E2E runtime settings file after local E2E execution:

```bash
git restore -- tests/e2e/test-vault/.obsidian/plugins/intelligence-assistant/config/user/settings.json
```
