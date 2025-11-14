# Remaining Lint Fix Plan (Do NOT modify eslint.config.mts)

Summary of latest lint run:
- Total: 214 problems (96 errors, 118 warnings)
- Key rules:
  - @typescript-eslint/require-await
  - @typescript-eslint/no-unsafe-assignment (also unsafe destructuring/call)
  - @typescript-eslint/await-thenable
  - @typescript-eslint/restrict-template-expressions
  - obsidianmd/prefer-file-manager-trash-file
  - no-alert
  - obsidianmd/ui/sentence-case (warnings)

Hotspots by file:
- src/domain/workflow/nodes/definitions.ts: Many "require-await" on execute methods and a few unsafe assignments. This is the largest cluster.
- src/presentation/views/workflow-editor-view.ts: await-thenable, require-await, unsafe assignments.
- src/presentation/components/modals/ollama-model-manager-modal.ts: await-thenable, no-alert, sentence-case warnings.
- src/domain/workflow/storage/storage.ts: prefer-file-manager-trash-file.
- src/infrastructure/vector-store.ts, src/presentation/utils/config-field-metadata.ts, src/presentation/components/handlers/tool-call-handler.ts: restrict-template-expressions.
- core/error-handler.ts, domain/workflow/editor/* (canvas.ts, node-config-modal.ts, panel.ts), infrastructure/llm/* (ollama-provider.ts, sap-ai-core-provider.ts, base-streaming-provider.ts), domain/workflow/services/secure-execution.ts, infrastructure/document-grader.ts, workflow/services/debug-service.ts: no-unsafe-assignment and unsafe destructuring/calls.
- Broad UI sentence-case warnings across modals/tabs.

Constraints:
- STRICT: Do not modify eslint.config.mts.

---

## Phase 1 — Structural correctness (low risk, high impact)

Goal: Remove rule violations with minimal behavioral changes.

1) require-await
- Strategy:
  - If a function is truly synchronous, remove `async` and return direct values.
  - If consumer type expects Promise, return `Promise.resolve(...)` explicitly.
  - If the function internally does use asynchronous APIs (vault.read/modify, AI service, HTTP), keep `async` and include an actual `await`.

- Targets:
  - src/domain/workflow/nodes/definitions.ts:
    - Convert purely synchronous nodes (e.g., switch, merge, jsonStringify, math, regex, arrayOps, objectOps, template, vectorSearch placeholder, retry, throttle, etc.) to non-async OR wrap returns with `Promise.resolve(...)` if the node system requires a Promise.
    - Keep async for nodes that perform I/O (readNote, create/update notes, HTTP, AI chat, embedding, dailyNote, manageLinks with vault.read/modify, etc.), and ensure they have awaited operations.
    - Fix `getAvailableModelsWithProvider`: make it non-async or add a legitimate `await` (e.g., await Promise.resolve(defaultModels)) — prefer non-async since it's static now.
  - src/presentation/views/workflow-editor-view.ts:
    - Remove `async` from methods without await or add awaited cleanup where appropriate.
    - Avoid `await` on non-Promise values (see await-thenable in Phase 1.2).

2) await-thenable
- Strategy: Remove `await` when the target is not a Promise/Thenable; if callers expect an async return, wrap with `Promise.resolve(value)`.

- Targets:
  - src/presentation/views/workflow-editor-view.ts (~173, ~192)
  - src/presentation/components/modals/ollama-model-manager-modal.ts (~270)

3) prefer-file-manager-trash-file (Obsidian-specific)
- Strategy: Replace `Vault.delete()` with `app.fileManager.trashFile(file)` to respect user preference.

- Targets:
  - src/domain/workflow/storage/storage.ts: Replace deletion logic accordingly.
  - __mocks__/obsidian.ts: Ensure `app.fileManager.trashFile = jest.fn(async () =&gt; {})` exists to keep tests green.

---

## Phase 2 — Type-safety and runtime guards

4) restrict-template-expressions
- Strategy: Ensure template literals only interpolate string | number | boolean. Wrap with `String(value)` or use a helper (`toStringSafe`) that returns a safe string for undefined/unknown.

- Targets:
  - src/infrastructure/vector-store.ts (~151, ~179): use `String(id ?? '')` or safe helper.
  - src/presentation/utils/config-field-metadata.ts (~103): `String(numberOrBoolean)`.
  - src/presentation/components/handlers/tool-call-handler.ts (~130): guard undefined with fallback `''` or `String(...)`.

5) no-unsafe-assignment / unsafe destructuring / unsafe call
- Strategy: Narrow inputs at boundaries and normalize error types.
  - Use `unknown` for external/untyped data; only assign to typed structures after type guards (`isRecord`, `typeof x === 'string'`, `Array.isArray`).
  - For errors: normalize to string via a helper `getErrorMessage(error)` or define `error: unknown` and pick safe fields without direct calls.
  - For LLM provider responses: define interfaces for expected shapes; avoid destructuring `any`. Use guarded picks with fallback defaults.

- Targets:
  - core/error-handler.ts (~151): Avoid directly assigning caught error to typed variables; normalize via helper.
  - domain/workflow/editor/canvas.ts (~187–195): Replace any assignments with typed UI state; add guards.
  - domain/workflow/editor/node-config-modal.ts (~207, ~219, ~565, ~671, ~695): Introduce local types for config and safe mapping; normalize error.
  - domain/workflow/editor/panel.ts (~348): Same narrowing patterns.
  - infrastructure/llm/ollama-provider.ts (~60, ~101, ~110, ~120, ~290, ~299, ~310, ~392): Introduce typed DTOs; avoid destructuring `any` payload; pick expected fields with defaults.
  - infrastructure/llm/sap-ai-core-provider.ts (~70, ~142), infrastructure/llm/base-streaming-provider.ts (~90): Narrow responses and errors.
  - domain/workflow/services/secure-execution.ts (~173, ~175): Ensure `executeCode` returns a typed result object; guard external values.
  - infrastructure/document-grader.ts (~175, ~176), workflow/services/debug-service.ts (~192, ~196): Normalize error values to safe strings; avoid unsafe assignments.

---

## Phase 3 — UI cleanup

6) obsidianmd/ui/sentence-case
- Strategy: Convert UI text labels to sentence case. This is cosmetic, but extensive. Can batch edit where safe.

- Targets (examples; many files):
  - src/infrastructure/rag-manager.ts (~66, ~155, ~232, ~237, ~242, ~245)
  - Modals/tabs in presentation components (mcp-inspector-modal.ts, provider-config-modal.ts, mcp-server-modal.ts, ollama-model-manager-modal.ts, models-tab.ts, prompts-tab.ts, provider-tab.ts, rag-tab.ts, tools-tab.ts, websearch-tab.ts, agents-tab.ts, chat-view.ts labels, etc.)

7) no-alert
- Strategy: Replace `confirm` with Obsidian modal/dialog-based confirmation flow (or a custom confirmation modal).

- Target:
  - src/presentation/components/modals/ollama-model-manager-modal.ts (~217): Replace with a modal-based confirmation.

---

## Phase 4 — Final sweep and validation

8) Autofixes and unused variables
- Run `eslint --fix` to apply straightforward fixes.
- Manually remove unused variables that remain after refactors.

9) Validation gates
- `npm run lint` should pass with zero errors (warnings acceptable, but aim to reduce).
- `npx tsc --noEmit` type-check clean.

---

## Implementation details and patterns

- Synchronous execute nodes in workflow:
  - If node registry expects `Promise&lt;NodeData[]&gt;`, return `Promise.resolve([...])`.
  - Prefer non-async functions for performance and clarity when no await is needed.

- Error normalization:
  ```ts
  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  ```

- Safe records:
  ```ts
  function isRecord(v: unknown): v is Record&lt;string, unknown&gt; {
    return v != null &amp;&amp; typeof v === 'object' &amp;&amp; !Array.isArray(v);
  }
  ```

- Restrict template expressions:
  ```ts
  const path = `${String(base)}/${String(id ?? '')}`;
  ```

- Obsidian trash file:
  ```ts
  // storage.ts
  const app = context.services.app;
  if (!app?.fileManager?.trashFile) throw new Error('File manager not available');
  await app.fileManager.trashFile(file);
  ```
  And mock:
  ```ts
  // __mocks__/obsidian.ts
  export class App {
    // ...
    fileManager = {
      trashFile: jest.fn(async (_file: any) =&gt; {}),
    };
  }
  ```

---

## Suggested automation

Scripts available:
- scripts/fix-require-await.js: First pass for require-await.
- scripts/fix-template-expressions.js: Pass for template literals.
- scripts/fix-unsafe-assignment.js: Guard patterns for unsafe assignments.
- scripts/fix-unused-vars.js: Remove dead vars.
- scripts/fix-final-errors.js and scripts/fix-lint-errors.js: Orchestrated sweeps.

Recommended command sequence:
1) npm run lint
2) node scripts/fix-require-await.js
3) node scripts/fix-template-expressions.js
4) node scripts/fix-unsafe-assignment.js
5) Manually fix storage.ts and add fileManager mock in __mocks__/obsidian.ts
6) Replace confirm with modal in ollama-model-manager-modal.ts
7) Batch sentence-case fixes (can be iterative)
8) npm run lint --fix
9) npm run lint
10) npx tsc --noEmit

---

## Risks and safeguards

- Changing execute signatures: Ensure the workflow engine accepts non-async or Promise.resolve returns. In our code, execute methods are universally treated as async; returning Promise.resolve maintains compatibility.
- Provider response shapes: Use conservative guard and defaults to avoid runtime breakage.
- UI text changes: Cosmetic only; verify no i18n dependencies.

---

## Checklist

- [ ] Phase 1: require-await corrections in definitions.ts and workflow-editor-view.ts
- [ ] Phase 1: await-thenable removal; storage.ts change to trashFile; add __mocks__/obsidian.ts fileManager.trashFile
- [ ] Phase 2: restrict-template-expressions fixes (vector-store.ts, config-field-metadata.ts, tool-call-handler.ts)
- [ ] Phase 2: no-unsafe-assignment fixes (error-handler, editor modules, providers, secure-execution, graders)
- [ ] Phase 3: sentence-case warnings cleanup across UI components
- [ ] Phase 3: Replace confirm with modal in ollama-model-manager-modal.ts
- [ ] Phase 4: final sweep with eslint --fix, npm run lint, and npx tsc --noEmit

Note: eslint.config.mts must remain unchanged throughout this plan.
