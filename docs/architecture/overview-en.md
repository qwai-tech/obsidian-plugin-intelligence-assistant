# Architecture Overview

Intelligence Assistant is a ports-and-adapters plugin organised by feature. `main.ts` is a thin Obsidian `Plugin` that loads settings and hands off to the composition root in `src/bootstrap/`. LLM providers live in a separate package, `packages/obsidian-llm` (`@qwai/obsidian-llm`).

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│ main.ts → src/bootstrap/   composition root (builds everything)│
└───────────────┬───────────────────────────────────────────────┘
                │ wires
┌───────────────▼───────────────┐   ┌───────────────────────────┐
│ ui/                           │   │ packages/obsidian-llm      │
│ chat · settings · modals      │   │ providers · HTTP port ·    │
│ views · editor · state        │   │ model manager · LLM hub    │
└───────────────┬───────────────┘   └─────────────▲─────────────┘
                │ calls                           │ used by
┌───────────────▼─────────────────────────────────┴─────────────┐
│ features/<name>/   use cases, ports and types per feature      │
│ agent · chat · conversations · knowledge · llm · settings      │
│ tools · usage · web-search                                     │
└───────────────┬───────────────────────────────────────────────┘
                │ ports implemented by
┌───────────────▼───────────────────────────────────────────────┐
│ adapters/  obsidian · persistence (JSON/JSONL) · process · rag │
└───────────────┬───────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────┐
│ core/  plugin paths · interfaces · constants · utils           │
└───────────────────────────────────────────────────────────────┘
```

Each feature keeps its types next to its code in `features/<name>/types/`; there is no shared `types/` folder. Each feature exposes one `index.ts` with explicit named exports (no `export *`); code outside the feature imports only from `@/features/<name>`. Lint rejects `export *` everywhere, including the `packages/obsidian-llm` entry point.

The import rules are enforced in `eslint.config.mts`, with no exemptions:

| Folder | May not import |
|--------|----------------|
| `core/`, `i18n/` | features, adapters, ui, bootstrap |
| `features/<name>/` | adapters, ui, bootstrap, and other features' internals (use their index) |
| `adapters/` | ui, bootstrap; features only as `import type` from their index |
| `ui/` | bootstrap; adapters only as `import type`; features only through their index |

UI code receives a `PluginHost` (`ui/plugin-host.ts`: app, manifest, settings, services, `updateSettings`) instead of the plugin class; only the settings tab, the chat view and the chat session controller see the plugin itself.

`core/`, `features/` and `ui/` may not import Node modules (`child_process`, `fs`, `node:*`, `cross-spawn`, …); those live in `adapters/` behind a port.
| `packages/obsidian-llm` | anything from the plugin (`@/*`) |

`bootstrap/` and `main.ts` are the only places that see every folder.

## Composition root — `src/bootstrap/`

- `create-services.ts` builds every service once and returns `OwnedServices`; the UI receives the narrower `AppServices` interface (`ui/app-services.ts`).
- `obsidian-settings-persistence.ts` and `plugin-data-service.ts` adapt the settings store to the plugin's JSON files.
- `tool-source-factory.ts` creates built-in, CLI, OpenAPI and MCP tool sources.
- `agent-entry-points.ts` and `plugin-integrations.ts` register commands, the inline AI block, deep links and RAG indexing on vault events.

`ChatView.onOpen` awaits `plugin.whenServicesReady()`, so views never construct services.

## Features — `src/features/`

**settings**: `SettingsStore` loads, migrates (`settings-migrations.ts`) and saves settings. API keys live in Obsidian's secret storage behind the `SecretVault` port (`settings-secrets.ts`, adapter `adapters/obsidian/obsidian-secret-vault.ts`): settings keep the secret's name, the store fills in the key on load and strips it from every write. Settings are stored in the plugin's `data.json` as one document (`settings-document.ts`: config, providers, prompts, agents), so Obsidian Sync carries them and `onExternalSettingsChange` reloads them. Every change goes through `updateSettings(change)`, the only write path. A save happens only when a unit (`config`, `providers`, `prompts`, `agents`, `mcp`) changed, and `onChange` subscribers learn which; the plugin uses that to refresh RAG and the chat model list. Model and MCP tool caches stay in `data/cache/`. Settings saved by older versions in `config/user/settings.json` and `data/` files move into `data.json` on first load (`adapters/persistence/legacy-settings-files.ts`). `types/settings.ts` holds `PluginSettings`.

**agent**:

- `kernel/turn-kernel.ts` — the agent loop. A turn is one model call plus its whole batch of tool calls. Ports: `ContextAssembler`, `ModelPort`, `ToolRunner`, `TurnGuard`.
- `kernel/budget.ts` — step and failure budget; the agent may raise its step budget with an `ESTIMATED_STEPS` marker on the first turn. Runs end with a typed `FinishReason`.
- `kernel/turn-guards.ts` — named retry rules (empty turn, missing write proposal) that appear in the trace.
- `agent-engine-loop.ts` — maps kernel events to chat callbacks and writes the run journal.
- `agent-sense-service.ts` — gathers the active note, references, graph neighbours, RAG hits and agent memory.
- `tool-access-editor.ts` — grants tools to an agent by id or by whole source.

Contracts shared with adapters (`KernelEvent`, `FinishReason`, `RunJournal`) live in `agent/types/agent-run.ts`. See ADR-001 and ADR-002.

**chat**: `chat.service.ts` streams chat-mode replies and routes agent mode to the engine loop. `chat-session-policy.ts` decides the active mode, agent, prompt and agent model. `conversation-namer.ts` generates titles and icons. `vault-export-service.ts` saves replies to notes.

**web-search**: `web-search-service.ts` dispatches to the backends in `backends.ts`.

**knowledge**: the `KnowledgeBase` and `MemoryIndex` ports (`knowledge-base.ts`) and the RAG configuration types.

**tools**: `ToolRegistry` holds every tool; `ToolSourceManager` loads and reloads the built-in, CLI, OpenAPI and MCP sources (`sources/`). Built-in tools are implemented in `*-tools.ts`. Tools declare side effects (`ToolSideEffects`, including `process` for CLI and MCP tools), which drive the capability summary and the autonomy rules.

**llm**: the LLM hub service, Ollama administration and the LLM/model types.

**conversations** and **usage** hold the conversation and token-usage types; their storage is in `adapters/persistence/`.

## Adapters — `src/adapters/`

- `persistence/json-file.ts` — atomic JSON writes (temp file, then rename) with recovery of a leftover temp file; `json-collection.ts` reads an index plus one file per item, the layout older versions used for prompts and agents. The caches, token usage and agent memory in `persistence/data/` are built on `JsonFile`.
- `persistence/jsonl-run-journal.ts` — appends one JSON line per agent event.
- `persistence/conversation-storage-service.ts` — conversations as per-file JSON.
- `rag/` — `rag-manager.ts`, `vector-store.ts`, `chunker.ts`, `embedding-manager.ts`, `document-grader.ts`, `incremental-indexer.ts`: vault indexing and retrieval. Chunks record a content hash and the embedding model, so unchanged notes are not re-embedded and searches only compare vectors from the same model. `RAGManager` implements `KnowledgeBase` and `MemoryIndex`.
- `obsidian/obsidian-file-system.ts` — the file-system port over the vault.
- `process/` — everything that starts a process: `mcp-stdio-session.ts` speaks MCP over a server's stdio (`connectMcpStdio` implements the tools feature's `McpConnector` port, resolving launchers such as `npx` with `resolve-command.ts`), and `command-runner.ts` implements the `CommandRunner` port that CLI tools use.

All plugin paths come from `core/plugin-paths.ts` (`pluginPaths(configDir)`), so the vault's real config folder is used.

## LLM package — `packages/obsidian-llm`

- `http.ts` / `obsidian-http.ts` — the `HttpPort`; `resilient-http.ts` adds timeout, retries on 429/502/503/504 and transport errors, and `AbortSignal` cancellation.
- `base-streaming-provider.ts` — SSE streaming with a fresh chunk parser per stream.
- `providers/openai-compatible-provider.ts` — shared base for OpenAI, DeepSeek and OpenRouter. Anthropic, Gemini and Ollama implement tool calling natively.
- `model-manager.ts` — one model cache per provider config, with de-duplicated in-flight requests.
- `hub.ts` — the cross-plugin LLM hub, which lends model access without exposing keys.

## UI — `src/ui/`

- `views/chat-view.ts` — the chat `ItemView`; it composes the header, input, message list and conversation sidebar. `views/chat-workspace.ts` opens and finds chat leaves; `views/agent-task-launcher.ts` starts agent tasks from commands.
- `chat/chat-session-controller.ts` — applies mode, agent, conversation config and quick toggles to the view.
- `chat/chat-message-list.ts` — message rendering, empty state and preflight card; `message-grouping.ts` folds legacy tool-call chains.
- `chat/controllers/` — `ChatController` (send, stream, live agent trace).
- `chat/managers/conversation-manager.ts` and `chat/conversation-list-view.ts` — the conversation sidebar.
- `settings/settings-tab.ts` — the settings UI combines Obsidian's declarative settings (1.13+) with nine top-level tabs. General settings retain searchable native definitions; the navigation renders each existing section from `settings/tabs/` in place, preserving its sub-tabs and save callbacks. The tab list supports arrow keys, Home/End, and wrapping at narrow widths. `settings/settings-form.ts` binds a settings section to toggle, dropdown, text, number, list and secret fields with one save path.
- `modals/` — dialogs.
- `state/chat-view-state.ts` — per-view state, including the `AbortController` for the running request.

## Testing

`npm run verify` runs lint, the typecheck, every Jest suite with coverage thresholds, and the build. The full set of test layers is in [reference/testing.md](../reference/testing.md).

- `npx jest` — unit tests (jsdom, Obsidian mock in `__mocks__/obsidian.ts`).
- `npx jest tests/harness tests/missions --runInBand` — agent missions against a mock LLM and an in-memory vault.
- `npm run test:e2e` — WebdriverIO against the latest Obsidian (`OBSIDIAN_VERSION` picks another).

## Design notes

- **No dynamic imports in the Electron renderer.** Chromium rejects `import()` with bare specifiers and blocks `file://` ESM, so ESM-only packages need bundling.
- **Settings are diffed, not rewritten.** Writes go through `plugin.updateSettings(settings => …)`, which applies the change and saves; the store writes only the units that changed, so redundant saves are cheap.


## Execution contracts hardened on 2026-11-04

Task authorization is an explicit host grant and Agent setting. Prompt text does
not grant autonomous writes. Deep links use the existing launch confirmation;
AI blocks require their existing Run button, including legacy `autorun: true`
blocks. Original user input is kept separate from expanded reference context
for external search. Tool names bind to the task's concrete registry snapshot;
a source refresh invalidates the binding instead of routing by a reused name.

Application-owned runs snapshot configuration and own cancellation, deadlines,
terminal states and shutdown draining. Signals reach model requests, HTTP tools,
CLI process groups, MCP requests, retrieval and memory indexing. Cancellation
cannot undo a side effect that already committed, and the host's buffered
requestUrl transport cannot promise remote cancellation. JSONL journals are
bounded to 100 runs and flushed at terminal boundaries; they are audit records,
not resumable checkpoints.

The final request budget includes serialized history, tool schemas/arguments,
context, image allowances and output reserve. It uses conservative UTF-8 size
estimation, not a model tokenizer; oversized current goals or schemas are
rejected rather than silently made incomplete. Tool history is grouped by call
identity. Memory retrieval and persistence are scoped by Agent and lifetime;
short-term memory stays in the session and long-term memory has a separate
scoped index, embedding identity and entry retention.

Unreadable JSON fails closed and remains on disk. Writes serialize per adapter
and path, retain a prior backup and use a recoverable temporary file. Settings
transactions serialize loading and saving; a failed commit restores live values.
The application still relies on Obsidian's own disk and Sync behavior and does
not claim multi-process locking or transactional crash recovery across Sync.

Shared framing/transport is separate from protocol-specific endpoints and
response decoders. Factory construction and discovery share provider descriptors.
SAP authentication/deployment management is separate from OpenAI, Gemini and
Bedrock protocols. Bedrock uses a real buffered completion rather than treating
AWS binary events as SSE. SAP service compatibility remains unverified until a
real tenant acceptance run is authorized.

ProviderFactory returns a frozen closure facade, and central accounting captures
successful, failed and aborted logical requests across chat, agent work, titles,
grading, embeddings and editor actions. Unknown usage is explicitly tagged;
zero stored tokens for an aborted call do not establish that a service charged
nothing. The facade is API encapsulation, not isolation from other Obsidian
plugins that share the same host. Release publication depends on real tests of
the exact built artifact, whose digest is verified again before publication.

New Agent conversations snapshot the selected Agent's effective model, sampling
and output budget rather than overwriting them with Chat defaults. Existing
explicit conversation overrides remain unchanged. Output-limit failures consume
trailing usage before rejecting and retain partial text in the existing reply
renderer. When native streaming is unavailable, the host buffers the real SSE
endpoint and validates its events instead of switching to a JSON completion
whose gateway may lose terminal metadata. No output-budget increase, automatic
continuation or thinking-mode change is implicit.

Long-run context retains a bounded ledger of omitted tool results and factual
records from saved conversation traces. These records do not create executable
calls, restore stale tool bindings, or grant permissions. Application-generated
execution summaries are tagged as expendable context, not synthesized assistant
turns. Immutable policy messages stay protected; old tagged context may be
removed to keep the whole request within budget. The current native tool batch
keeps its call identities, and small results retain exact checkpoint metadata
before older context is retired.

The user task is saved before model dispatch, so a reload during a long run does
not erase its request. Stop records survive reload and an explicit continuation
can use saved execution evidence. Agent conversation messages also persist a
bounded logical task checkpoint: the original user goal, explicit tool
restrictions, unique successful calls with visit counts, the latest new read,
the latest observed read, and pending or uncertain calls. Re-reading an earlier
source for verification does not move the latest new read backward. A bare
`Continue.` or `Resume.` reconstructs the task before the rolling context window
is applied; older saved execution traces can be migrated into the same factual
record. A distinct user task starts a fresh checkpoint. This is context recovery,
not automatic tool replay or proof of semantic completion. The run coordinator
is still in-memory, and the journal does not automatically replay a crashed run.
Exactly-once effects and idempotency remain properties of actual tools/artifacts;
a pending external call can have an uncertain outcome and must be inspected
before retry.

Explicit top-level directives such as `Use only read_file;` and
`Only use the read_file tool.` narrow both model tool schemas and dispatch-time
permissions, including after a bare continuation. They intersect configured
Agent permissions and any host allowlist; they never grant a capability.
`No tools.` denies all tools. Quoted examples, blockquotes and fenced code are
not directives. Recognized restrictive directives with unsupported syntax fail
closed. This intentionally limited grammar is not general natural-language
policy interpretation; use exact tool names for task restrictions. Persisted
checkpoint metadata is removed from provider messages and supplied as bounded
application context instead.

Live execution facts are appended after all preceding tool results in each model
request. This placement matters: a current cumulative snapshot before recent
results can be misread as an earlier boundary to which those results must be
added again. Per-run counters include the current run ID; saved task checkpoints
also retain the most recent finished run's ID, outcome and successful-call counts.
A new continuation resets current-run counts to zero without invalidating the
previous run's receipt. Legacy runs recover a receipt from saved successful
action records when available.

Before a tool-free answer is accepted, an execution-count guard compares the
canonical JSON `thisRunReads` field and recognized explicit English current-run
read claims with actual successful `read_file` events. Explicit `previousRun`
JSON is checked against that separate receipt. A recognized false withdrawal of
a recorded earlier count is also rejected. The guard requests a fresh concise
report, omits the rejected candidate to reduce anchoring, grants no new tool
access and accepts no inconsistent completed answer after two failed corrections.
It does not reinterpret domain totals, rewrite numeric values silently, or prove
every arbitrary natural-language quantity. Per-file repeat counts exclude the
first successful read; changed or omitted evidence still requires inspection.

If an already executed call has argument metadata too large to fit at all, the
whole historical batch becomes bounded factual context with its recorded result.
Arguments are never altered to create misleading executable tool history. This
fallback is separate from shortening a large result while retaining native IDs.

Free Agent completion now has an explicit internal status protocol and a bounded
reconsideration step. A progress-only or unmarked response does not directly
close the task. Complete answers receive a review; blocked/needs-input answers
remain possible. Two attempts without tool progress fail explicitly as incomplete.
The guard does not force a tool choice, alter reasoning mode, or expand existing
authorization. It is model self-review, not a universal semantic proof of task
completion. Independent acceptance checks inspect actual task artifacts.

Guard corrections are application context, never replacement user goals. An
unconfirmed response is explicitly quoted as candidate data rather than replayed
as a native assistant turn with missing reasoning metadata. Only the latest
correction is non-expendable; earlier corrections can retire. Internal status
comments remain available to the state machine but are omitted from live reply
text and final rendered answers. No renderer layout/control changes are needed.

Each kernel run has a stable runtime identity and a bounded, non-expendable
first-observation anchor. Later status results cannot overwrite the first facts.
Saved conversation evidence separately preserves its originating task excerpt,
source timestamp, successful/pending action counts and last successful action.
Rolling records label prior_history versus current_run. These are factual data,
not instructions, permission grants, approval evidence or executable old bindings.
A successful tool return still does not prove a write proposal was approved.

Streaming resilience distinguishes waiting for response headers, inactivity after
headers, and the stream's absolute lifetime. Without explicit overrides, headers
and each non-empty-byte gap are bounded by five minutes; an active stream may
continue for up to fifteen minutes. Explicit request/options timeoutMs keeps its
absolute-deadline meaning. Buffered requests, which cannot observe intermediate
progress, retain the five-minute total limit. Byte progress (including SSE
heartbeats) resets only the inactivity timer, never the hard cap. Timeout errors
include the phase, elapsed time and byte count; model POSTs are not automatically
retried. These limits cannot repair an upstream stall or guarantee service latency.

Completion reconsideration audits numeric scope in structured data and prose.
A total returned by a call targeting one object is not independently established
as cumulative merely because an earlier assistant called it that. Unverified
intermediate aggregates must be omitted or labelled as the exact call's returned
field; aggregate evidence is required for task-wide claims. Bounded candidate
excerpts retain both the opening and ending so an erroneous closing explanation
is available to review; omitted middle content is explicitly marked unreviewed.
This remains model self-review, not a deterministic proof of arbitrary prose.

A progress/liveness correction does not satisfy the final-answer review. Exact
derived figures require actual permitted computation output. An assistant-written
equation is not itself verification; unavailable exact quantities must be reported
as missing verification rather than silently guessed. This policy does not add a
calculator or new permissions to the plugin and cannot guarantee model compliance.

Action reliability: progress corrections are concise execution checks. They do not
quote the progress-only acknowledgement back to the model, and explicitly mark
any initial acknowledgement request as satisfied. The latest correction is
removed once tool use resumes, preventing that resolved prompt from persisting
as protected context. Final factual review remains separate. No tool is forced;
blocked/input-needed and plan-only replies remain valid, and no-progress retries
remain bounded at two.

Trusted ToolDefinition/CLI configuration may declare argumentSources: a target
argument, conditional operation, successful source tool/operation, matching
source/target argument names, and an output property path. RegistryToolRunner
checks actual per-run receipts before dispatch. A matching observed scalar must
be copied exactly; a wrong value, missing read, or other target is rejected before
external execution. The default consumes a receipt at dispatch, even on uncertain
failure. Failed source refreshes invalidate old receipts; new runs start empty.
Only own structured-output properties are read, including JSON-encoded CLI data.
The receipt store is bounded and a small exact-value context survives model
history clipping. Receipts do not grant permissions or prove a write was approved.

This is a declared contract, not a universal semantic parser. Unconfigured tools
retain existing argument/schema behavior, including legitimately creating new
identifiers. Native built-in file tools, arbitrary CLI commands and MCP/OpenAPI
adapters do not acquire read-before-use semantics automatically. Source authors
must supply accurate trusted contracts; tool implementations still validate live
state. The CLI configuration round-trips without adding or changing UI controls.

Source readiness includes an explicit zero count, so absence of a receipt does
not look like an omitted status. A source-rejected proposal is journalled as
non-dispatched, costs a step, and has a separate two-consecutive-rejection bound
without successful tool progress. It is not charged as an externally executed
tool failure; the three real-failure cap remains. This can repair isolated
missing-read proposals throughout a long task without silently increasing any
failure cap or dispatching an invalid call. Final-review candidate data is tagged
expendable separately from protected review instructions, retaining whole-request
budget enforcement when the candidate is long.
