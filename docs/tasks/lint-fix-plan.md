Title: Lint Errors Fix Plan (Do Not Modify eslint.config.mts)

Scope and Constraints
- Goal: Reduce and resolve current ESLint violations across src while maintaining behavior.
- Hard constraint: Do not modify eslint.config.mts.
- Strategy: Phased remediation combining auto-fix scripts and targeted manual edits.

Current Snapshot (from npm run lint)
- Total: 213 problems (95 errors, 118 warnings)
- Major error categories:
  - @typescript-eslint/require-await: Many async methods with no await, concentrated in src/domain/workflow/nodes/definitions.ts and UI views.
  - @typescript-eslint/await-thenable: Await used on non-Promise values (e.g., workflow-editor-view.ts).
  - @typescript-eslint/no-unsafe-assignment: Assignments from any/error typed values and unsafe destructuring in providers, editor, infrastructure, and UI controllers.
  - @typescript-eslint/restrict-template-expressions: Template literals with possibly undefined or non-string types (vector-store.ts, config-field-metadata.ts, tool-call-handler.ts).
  - no-alert: Raw confirm usage (ollama-model-manager-modal.ts).
  - obsidianmd/ui/sentence-case (warning): Many UI strings across tabs and modals.
  - @typescript-eslint/no-unsafe-call: Calling values typed as error (workflow-editor-view.ts at line 300).

High-Impact Hotspots (files with multiple violations)
- src/domain/workflow/nodes/definitions.ts: Dozens of require-await across node execute methods and helpers; several unsafe assignments.
- src/presentation/views/workflow-editor-view.ts: await-thenable, require-await in lifecycle methods, unsafe assignment/call for error typed values.
- src/presentation/views/chat-view.ts: require-await in helper methods, several unsafe assignments in UI helpers.
- src/infrastructure/vector-store.ts: restrict-template-expressions, unsafe assignment.
- src/presentation/utils/config-field-metadata.ts: restrict-template-expressions with number | boolean.
- src/presentation/components/…: Many sentence-case warnings; isolated unsafe assignment (tools-tab.ts, message-controller.ts).
- src/infrastructure/llm/… (ollama-provider.ts, sap-ai-core-provider.ts, base-streaming-provider.ts): unsafe assignment and unsafe object destructuring from untyped provider responses.
- src/domain/workflow/services/secure-execution.ts: unsafe assignments.
- src/core/error-handler.ts: unsafe assignment of error typed value.

Phased Remediation Plan
Phase 0: Guardrails
- Do not modify eslint.config.mts.
- Work in small, verifiable commits; re-run lint after each phase.

Phase 1: Automated and Safe Fixes
- A1. Run built-in auto-fix:
  - Command: npm run lint:fix
  - Purpose: Apply safe formatting and autofixable rule changes to reduce noise.

- A2. Use dedicated remediation scripts found under scripts/:
  - scripts/fix-require-await.js
    - Target rule: @typescript-eslint/require-await
    - Strategy: Where functions/methods are marked async but have no await:
      - Either remove async and change return type to non-Promise for pure sync flows.
      - Or, for APIs requiring async signatures (e.g., interface expects Promise), insert an actual awaited promise (prefer refactor to true async flows rather than await Promise.resolve()) when semantically required.
  - scripts/fix-promise-returns.js
    - Target rule: @typescript-eslint/await-thenable
    - Strategy: Remove await from non-thenable contexts; ensure only Promise-returning calls are awaited.
  - scripts/fix-template-expressions.js
    - Target rule: @typescript-eslint/restrict-template-expressions
    - Strategy: Wrap values with String(value) or add nullish coalescing (value ?? '') inside template literals; handle undefined/optional types explicitly.
  - scripts/fix-unsafe-assignment.js
    - Target rule: @typescript-eslint/no-unsafe-assignment (including error typed values)
    - Strategy: Convert any/error typed values to unknown; refine via type guards; access only safe properties (e.g., error instanceof Error ? error.message : String(error)). Avoid unsafe destructuring from untyped sources.
  - scripts/fix-unused-vars.js
    - Clean up unused and trivial variable warnings where possible.
  - scripts/fix-final-errors.js
    - Final sweep script to catch remaining common patterns; use cautiously and review diffs.
  - scripts/fix-lint-errors.js
    - General orchestrator; use if it batches relevant steps.

- A3. Re-run lint to capture residual issues:
  - Command: npm run lint
  - Record new counts and update this plan (see docs/tasks/lint-fix-summary.md).

Phase 2: Targeted Manual Fixes (Hotspots)
- B1. src/domain/workflow/nodes/definitions.ts
  - Problem: Many async execute methods without awaits; some unsafe assignments.
  - Plan:
    - Review node interface expectations. If execute is allowed to be sync: remove async and adjust signatures, ensuring compatibility with WorkflowExecutor and type definitions in core/types.
    - If async signature is required by the pipeline: ensure internal async operations exist (e.g., IO, vault, http); otherwise refactor to return sync and wrap in Promise if callers strictly expect Promise (but prefer true sync functions).
    - Replace any/unknown flows: use typed payloads, refine inputs, and guard outputs with predicates.

- B2. src/presentation/views/workflow-editor-view.ts
  - await-thenable at lines 173 and 192: awaiting functions that are not async (e.g., createEditor()).
    - Action: Remove await and, where needed, call via void this.createEditor(); ensure call sites do not expect a Promise.
  - onClose require-await: async method with no await; convert to onClose(): void if the lifecycle permits; otherwise add awaited work that truly needs async (e.g., asynchronous teardown).
  - Unsafe error typed assignment and call (line 300):
    - Use safe error handling pattern:
      const err = _error instanceof Error ? _error : new Error(String(_error));
      console.error('Failed…', err);
      new Notice(`Failed…: ${err.message}`);
    - Avoid calling error variable as a function or accessing properties without guards.

- B3. src/presentation/views/chat-view.ts
  - isQuerySuitableForWebSearch declared async without await:
    - Convert to sync function (remove async), fix callers to not await.
  - Unsafe assignments in UI helpers (lines ~981–986):
    - Ensure safe DOM operations and typed assignments; avoid any; use HTMLElement | null checks and narrow types before assignment.

- B4. src/infrastructure/vector-store.ts
  - restrict-template-expressions at lines 151, 179:
    - Example fix: `\${String(modelId ?? '')}`; handle optional types via nullish coalescing.
  - unsafe assignment (line 190):
    - Refine source type; avoid assigning unknown/error/any without guards.

- B5. src/presentation/utils/config-field-metadata.ts
  - restrict-template-expressions (line 103 with number | boolean):
    - Use `String(value)` or explicit formatting for booleans and numbers.

- B6. src/presentation/components/handlers/tool-call-handler.ts
  - restrict-template-expressions:
    - Explicitly coerce to string: `\${String(id ?? '')}`.

- B7. src/domain/workflow/services/secure-execution.ts
  - unsafe assignments (lines 173, 175):
    - Guard inputs/outputs; introduce narrow types for sandbox results; convert any to unknown and validate shape before assignment.

- B8. src/core/error-handler.ts
  - unsafe assignment (line 151):
    - Standardize error: `const err = error instanceof Error ? error : new Error(String(error));` then safely use err.message.

- B9. src/infrastructure/llm/ollama-provider.ts, base-streaming-provider.ts, sap-ai-core-provider.ts
  - unsafe assignment / unsafe object destructuring:
    - When parsing provider responses, treat unknown payloads; validate expected keys before destructuring; use schema or type guards.

- B10. UI Sentence Case Warnings (multiple files)
  - Standardize UI strings to sentence case. Example: 'select all' → 'Select all'; 'no files indexed yet.' → 'No files indexed yet.'
  - Batch changes across modals/tabs. Non-functional UI text changes; review for localization considerations.

- B11. no-alert in ollama-model-manager-modal.ts
  - Replace confirm with Obsidian Modal and buttons or Notice-based prompts.
  - Ensure no direct window.confirm usage remains.

Verification and Quality Gates
- C1. Re-run ESLint after each sub-phase:
  - npm run lint
  - Track counts and update docs/tasks/lint-fix-summary.md with before/after numbers.

- C2. Type check and tests:
  - npm run type-check
  - npm test (and test:watch if needed)
  - Fix type regressions due to stricter guards and signature changes.

- C3. Functional smoke tests:
  - Dev startup: npm run dev
  - Exercise: ChatView, WorkflowEditorView, basic node execution and storage operations.
  - Ensure delete operations work with app.fileManager.trashFile; exists() returns Promise<boolean>.

Change Management and Risk Mitigation
- Prefer removing async when functions are truly sync; avoid adding artificial awaits.
- Where interfaces require Promises, ensure behavior is truly async or document wrapping strategy.
- Use unknown + type guards to avoid unsafe assignments; do not suppress rules.
- Avoid modifying eslint.config.mts.

Deliverables
- Updated code per the plan.
- docs/tasks/lint-fix-summary.md: Reduced counts with explanations.
- docs/tasks/remaining-lint-fix-plan.md: Items postponed due to complexity.

Proposed Command Sequence (for execution phase)
1) npm run lint
2) npm run lint:fix
3) node scripts/fix-require-await.js
4) node scripts/fix-promise-returns.js
5) node scripts/fix-template-expressions.js
6) node scripts/fix-unsafe-assignment.js
7) node scripts/fix-unused-vars.js
8) node scripts/fix-final-errors.js
9) npm run lint
10) npm run type-check
11) npm test

Ownership and Prioritization
- Round 1 (quick wins): workflow-editor-view.ts (await-thenable and require-await), chat-view.ts (require-await), config-field-metadata.ts and tool-call-handler.ts (restrict-template-expressions), core/error-handler.ts (unsafe assignment).
- Round 2 (structural): nodes/definitions.ts (execute methods), infrastructure providers (safe parsing/destructuring), secure-execution.ts.
- Round 3 (UI polish): sentence-case warnings across tabs/modals; no-alert replacement.

Notes
- Keep changes minimal but typed; rely on type guards to satisfy no-unsafe-* rules.
- Validate storage and editor lifecycle changes with manual run since Obsidian APIs are runtime-driven.
