# Tool System Refactor — Phase 5: Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the tool system refactor by wiring the migration that Phase 3 wrote but never called, deleting the four legacy service files that Phases 2–3 supposedly replaced, switching the remaining consumers off the old `ToolManager`, and removing the five legacy agent tool fields. After this lands, the codebase has exactly one tool system, not two parallel ones.

**Architecture:** The new system already exists (`ToolRegistry` + four `ToolSource` implementations + `AgentToolAccess`). The cleanup is mechanical: switch every remaining consumer of the old `ToolManager`/`mcp-service`/loaders to the new system, then delete the dead files. The migration of legacy `Agent` fields (`enabledBuiltInTools` etc.) into `toolAccess` is already written in `tool-migrations.ts` — it just needs to be called at config load time.

**Tech Stack:** TypeScript (strict), Jest + ts-jest, WDIO smoke spec for the E2E gate.

**Companion spec:** `docs/superpowers/specs/2026-05-22-tool-system-refactor-design.md`
**Earlier phases (partially executed):**
- `2026-05-22-tool-system-refactor-1-core.md` ✅
- `2026-05-23-tool-system-refactor-2-sources.md` ✅
- `2026-05-23-tool-system-refactor-3-wiring.md` 🟡 (chat.service done; agent fields, mcp-tab, agent-edit-modal NOT done)
- `2026-05-23-tool-system-refactor-4-schema.md` 🟡 (read-side done; auto-migrate + write-side NOT done)

---

## Stage A: Wire the migration that's defined but never called

The migration function `migrateAllAgents` exists in `src/application/tools/tool-migrations.ts` and is unit-tested — but no production code calls it. As a result every existing agent in production data stays on the legacy 5-field schema and the `toolAccess` branches in `agent.model.ts` are dead.

- [ ] **Task A1.** Wire `migrateAllAgents` into the config load path. The right place is `normalizeConfig` in `src/types/settings.ts`, after `agents` is read and before the returned `PluginSettings` is assembled. Pass the full list of cli tool ids so the migrator can map "enable all CLI" to per-source.
- [ ] **Task A2.** Add a regression unit test asserting that a legacy agent loaded from config comes out with `toolAccess.sources` populated and the 5 legacy fields still readable (so we don't accidentally drop user state).
- [ ] **Task A3.** Run `npm test -- tool-migrations` and the existing `agent.model.test.ts` to make sure nothing regresses. Commit Stage A.

## Stage B: Switch remaining consumers off the old `ToolManager`

These call sites still use the dead-old plumbing even though `chat.service` already moved over.

- [ ] **Task B1.** `src/presentation/components/tabs/mcp-tab.ts` — replace every `plugin.getToolManager().registerMCPServer(...)` / `unregisterMCPServer(...)` / `getMCPServers()` call with `ToolRegistry`-equivalent operations. The new equivalent is to call `registry.registerSource(new McpToolSource(...))` and `registry.unregisterSource('mcp', name)`. The tab keeps its UI; only the wiring changes.
- [ ] **Task B2.** `src/presentation/components/settings-tab.ts` — replace `snapshotMcpTools` (re-exported from the soon-deleted `mcp-service.ts`) with a `ToolRegistry`-based snapshot helper. Either add `ToolRegistry.snapshotMcpTools()` or inline a 3-line replacement that walks the registry's MCP-kind sources.
- [ ] **Task B3.** `src/presentation/components/modals/mcp-inspector-modal.ts` — switch any `ToolManager`/`mcp-service` reads to the registry.
- [ ] **Task B4.** `src/presentation/components/chat/handlers/tool-call-handler.ts` — currently still types `options: ToolManager`. Switch to `ToolRegistry` so the handler doesn't keep the old class alive.
- [ ] **Task B5.** Lint + build. Commit Stage B.

## Stage C: Resolve `allowOpenApiTools` (incl. the uncommitted half-edit)

The design's Section 5.2 item #3 calls for removing the global `allowOpenApiTools` flag and replacing it with per-agent `toolAccess` for the `openapi:*` sources. The migration is already written. There's an uncommitted half-edit on `chat-controller.ts:373` that drops the prop but doesn't follow through.

- [ ] **Task C1.** Remove `allowOpenApiTools` from `tool-call-handler.ts` (both the type field at line 17 and the read at line 102). OpenAPI tools are now allowed/denied via `agent.toolAccess` — the handler should just check that the requested tool is in the resolved set.
- [ ] **Task C2.** Remove `hasEnabledOpenApiTools` from `main.ts` (it has no callers after C1).
- [ ] **Task C3.** Drop the uncommitted line in `chat-controller.ts:373` cleanly — the prop is gone so there's nothing to pass.
- [ ] **Task C4.** Update the unit test `chat-controller-message.test.ts` that currently mocks `hasEnabledOpenApiTools` — drop that mock entry.
- [ ] **Task C5.** Lint + build + run the relevant unit test suites. Commit Stage C.

## Stage D: Delete the four legacy service files

After Stages B + C nothing should import these.

- [ ] **Task D1.** First verify zero imports remain:

```bash
grep -rln "from.*services/tool-manager\|from.*services/mcp-service\|from.*services/cli-tool-loader\|from.*services/openapi-tool-loader" src main.ts --include="*.ts"
```

Expected: empty. If anything matches, go fix the import before deleting.

- [ ] **Task D2.** `git rm src/application/services/tool-manager.ts src/application/services/mcp-service.ts src/application/services/cli-tool-loader.ts src/application/services/openapi-tool-loader.ts`.
- [ ] **Task D3.** Update `src/application/services/index.ts` — remove `export * from './mcp-service'` and any other re-exports of the deleted files.
- [ ] **Task D4.** Update `main.ts` — drop the `ToolManager` import and instantiation (`sharedToolManager`, `getToolManager`, the cleanup path, `snapshotMcpTools` re-export). Also remove `ensureAutoConnectedMcpServers` method since it's only invoked via `mcp-service.ts`.
- [ ] **Task D5.** Delete or migrate the old `openapi-tool-loader.load-fn.test.ts` — if the load function moved to `openapi-tool-source.ts`, that source should already have its own test (it does). Delete the old test file.
- [ ] **Task D6.** Lint + build + `npm test` baseline. Commit Stage D.

## Stage E: Remove the 5 legacy agent tool fields

After Stage A, `toolAccess` is always populated on load. Stage E removes the now-redundant fields. This is the deepest change because of the type-level fanout.

- [ ] **Task E1.** Update `src/types/core/agent.ts` — remove `enabledBuiltInTools`, `enabledMcpServers`, `enabledMcpTools`, `enabledCLITools`, `enabledAllCLITools`. Make `toolAccess: AgentToolAccess` required (drop the `?`).
- [ ] **Task E2.** Update `src/domain/agent/agent.model.ts` — remove the `else` branches that fall back to legacy fields in `canUseTooling` and `getToolsCount`. They become single-branch reads of `toolAccess`.
- [ ] **Task E3.** Update `src/domain/agent/agent-templates.ts` — every default agent template needs to define `toolAccess` directly instead of legacy fields.
- [ ] **Task E4.** Update `src/test-support/test-utils.ts` — the `createTestAgent` factory generates an `Agent`; switch its defaults to `toolAccess: { sources: {} }`.
- [ ] **Task E5.** Update `src/application/services/agent-service.ts` — any reads of legacy fields become reads of `toolAccess`.
- [ ] **Task E6.** Update `src/presentation/components/chat/controllers/agent-controller.ts` and `src/presentation/components/chat/handlers/tool-call-handler.ts` — same.
- [ ] **Task E7.** Update `src/presentation/components/tabs/agents-tab.ts` — the "tools count" display reads from `toolAccess` only.
- [ ] **Task E8.** Update `src/__tests__/domain/agent.model.test.ts` and `src/application/tools/__tests__/tool-migrations.test.ts` — drop test cases that exercise the legacy branches; add cases that exercise the toolAccess-only paths.
- [ ] **Task E9.** Update `src/presentation/components/modals/agent-edit-modal.ts` — the editor needs to read/write `toolAccess` directly. Today it reads legacy fields and shows toolAccess as a read-only summary. At minimum: keep the existing editor controls but persist into `toolAccess` (a small adapter). Full editor redesign is out of scope.
- [ ] **Task E10.** `tool-migrations.ts` — the migration function still takes the legacy `Agent` shape via `agent.enabledBuiltInTools` etc. After E1 the type doesn't have those fields. Switch the migration to accept `Partial<LegacyAgent>` or read fields off `unknown`. (The function is only called once at load time on raw JSON, so loose typing is acceptable.)
- [ ] **Task E11.** Lint + build + `npm test` + smoke. Commit Stage E.

## Stage F: Final verification

- [ ] **Task F1.** Run the full triad:
  ```bash
  npm run lint && npm run build && npm run test:e2e:smoke
  ```
  All must pass. Unit test count should be ≥ pre-cleanup (we don't accept regressions; we accept 88 pre-existing failures that exist on `main` already).
- [ ] **Task F2.** Confirm via grep that no occurrences of the legacy plumbing remain:
  ```bash
  grep -rln "ToolManager\b\|enabledBuiltInTools\|enabledMcpServers\|enabledMcpTools\|enabledCLITools\|enabledAllCLITools\|allowOpenApiTools\|hasEnabledOpenApiTools" src main.ts --include="*.ts" | grep -v "__tests__\|tool-migrations.ts"
  ```
  Should be empty (the migration file is allowed to know about the legacy names; tests too if they're testing migration).
- [ ] **Task F3.** Update `docs/project/e2e-backlog.md` if any "deferred Phase 5 cleanup" items now ship.

---

## Order rationale

A before everything else: until existing agent configs migrate at load time, removing the legacy fields would silently zero out every user's enabled tools.

B before D: the deletes only succeed after the remaining call sites switch away.

C alongside D: `allowOpenApiTools` removal is per-agent semantics — only safe after A guarantees `toolAccess` is populated.

E last: it's the deepest type-level change and benefits from B/D narrowing the surface first.

## Risks and mitigations

- **Risk: agent-edit-modal UI breaks during E.** Mitigation: keep the existing UI controls but adapt them to read/write `toolAccess`. Don't redesign the editor here.
- **Risk: mcp-tab's reconnect-server flow needs different lifecycle from `ToolManager.registerMCPServer`.** Mitigation: `ToolRegistry.registerSource(new McpToolSource(server))` followed by `registry.reload()` gives the same effect (connects, loads tools, caches them).
- **Risk: 88 pre-existing test failures hide a regression I introduce.** Mitigation: run `npm test -- <specific file>` for the touched test files at each stage rather than relying on the global count.
- **Risk: I touch a `*.backup` file leftover.** Mitigation: grep operations exclude them by default; `git ls-files` is the source of truth for what's tracked.
