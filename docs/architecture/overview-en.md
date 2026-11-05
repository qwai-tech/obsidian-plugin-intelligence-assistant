# Architecture overview — 0.1.0

[中文](overview-zh.md) · [Detailed execution contracts](execution-contracts.md) · [Developer guide](../project/project-guide-en.md)

Intelligence Assistant uses feature-oriented services, a port-based Agent turn kernel and explicit Obsidian adapters. `main.ts` owns the plugin lifecycle; `src/bootstrap/` composes services. `packages/obsidian-llm` owns provider protocols, HTTP transport and model identity.

## Ownership

| Area | Responsibility |
|---|---|
| `main.ts`, `src/bootstrap/` | Host registration, composition, lifecycle, settings persistence wiring and integrations |
| `src/ui/` | Views, controllers, settings Tabs, dialogs, editor actions and rendering |
| `src/features/` | Agent/chat use cases, settings, knowledge/tool ports and feature-owned types |
| `src/adapters/` | Obsidian/filesystem persistence, RAG, embeddings, subprocesses and MCP stdio |
| `src/core/` | Shared helpers, paths, notifications and defaults |
| `src/i18n/`, `src/capabilities/` | Translation resources and the Obsidian API capability manifest |
| `packages/obsidian-llm/` | Provider registry, model discovery/identity, native protocols, HTTP and Hub contracts |

Lint restrictions in `eslint.config.mts` define the actual allowed imports. Feature consumers use explicit `index.ts` exports. This is an ownership/dependency structure, not a process sandbox: host-specific tools and adapters still have the permissions of Obsidian.

## Startup and disposal

1. `main.ts` installs notification/HTTP adapters and registers views, commands, editor integration and settings.
2. `SettingsStore` loads and validates settings, migrates legacy documents and resolves SecretStorage references.
3. `create-services.ts` constructs shared services once. `whenServicesReady()` lets views wait for them.
4. Deferred initialization handles the version marker, default Agent, conversation migration and tool-source initialization. Configured MCP auto-connect can start external processes.
5. Disposal cancels/drains owned runs and closes services. Cancellation does not undo a completed external effect.

`RunCoordinator` manages ownership, admission and cancellation. It is in-memory; a JSONL journal does not turn it into a durable workflow/replay engine.

## Requests and the Agent kernel

`ChatController` collects the user's text, attachments and references. `ChatService` prepares ordinary chat or delegates Agent mode to `AgentEngineLoop`. The original user text is kept separate from expanded private context for Web search.

For Agent mode, the engine snapshots the selected Agent/model policy, senses configured context, resolves allowed tools and runs `kernel/turn-kernel.ts`. Each turn requests a model response, validates/reviews it, and executes the returned tool calls in order. Kernel ports are `ContextAssembler`, `ModelPort`, `ToolRunner` and `TurnGuard`.

Important contracts:

- `Budget` starts from the host-configured step allowance. An initial model estimate may raise it but cannot shrink it. The effective estimate ceiling is at least the configured allowance. Tool attempts consume steps; failure and preflight-rejection accounting are separate. See [ADR-002](adr-002-agent-budget-and-trace.md).
- Request budgeting includes tool schemas/arguments, system/context content and the output reserve. `HistoryCompactor` bounds history and keeps bounded omission/verification evidence; it does not make an omitted source authoritative again.
- Completion/argument/count guards can request a correction or stop an incomplete run. They do not prove arbitrary semantic task completion, domain arithmetic or every natural-language paraphrase.
- Model output limits, filters and incomplete streams are errors with preserved partial results, not successful final chunks. Generation is not silently retried with a larger budget or changed reasoning mode.
- Stop propagates through model, HTTP and subprocess paths. A timed-out or interrupted external operation may have an uncertain effect.

Detailed contracts, including the bounded read-before-use grammar and recognized count fields, are in [execution-contracts.md](execution-contracts.md).

## Continuation and counts

`task-checkpoint.ts` resolves a bare `Continue.`/recognized resume request against the original task before rolling context is clipped. It retains bounded successful observations, pending/uncertain actions, restrictions and a prior-run receipt. Re-reading a known source increments visits without redefining the unfinished boundary.

The live current-run counters are appended after preceding tool results. Current-run and previous-run receipts have separate scopes. `execution-count-guard.ts` checks supported runtime fields and recognized explicit read-count claims; it can reject a contradictory candidate. This is not a universal arithmetic validator.

Reloading and then continuing uses persisted conversation evidence. It does not automatically replay the journal, guarantee exactly-once external effects or prove that the model chose a correct restart point. Actual files/tool results remain necessary evidence.

## Tools and authorization

`ToolSourceManager` registers/resynchronizes built-in, CLI, OpenAPI and MCP sources. `ToolRegistry` validates arguments, resolves stable tool identities and executes the binding captured for the current task. Reloading a source invalidates stale bindings.

The registered built-ins are listed in the [user guide](../user-guide-en.md#built-in-tools). There are no registered built-in move/delete tools. Agents receive the intersection of enabled sources, Agent permissions and recognized task/host restrictions. A task restriction cannot grant a capability.

Supported built-in vault writes return structured proposals. `execution-policy.ts` enables auto-application only when the Agent setting is true **and** the host task is approved. Free-text intent alone is not a grant. The normal path leaves Apply-gated cards; authorized auto-application returns actual applied results. See [ADR-001](adr-001-safety-and-engine-usage.md) and [ADR-003](adr-003-autonomous-write.md).

CLI/MCP/HTTP effects are different: configured tools can act directly under their process/service permissions. Proposal validation and the subprocess environment allowlist are not filesystem/network isolation. A batch of effects is not an atomic transaction.

## Persistence and secrets

`ObsidianSettingsPersistence` writes a format-2 `data.json` using the host's `Plugin.saveData`. It contains user configuration, provider definitions, prompts and Agents. `SettingsStore` serializes local updates and rolls back its working state after a failed save. The adapter keeps `data.json.bak`; old repository-style settings are removed after successful migration.

Model/MCP caches, usage, memory and the vector index use files under `data/`. `JsonFile` uses temporary-file/rename recovery for repositories that use that adapter. Conversations use per-conversation JSON; run journals append JSONL with retention. These mechanisms do not provide cross-process/Sync transactions or make every host settings write an atomic multi-file operation.

Provider/API keys, SAP Service Keys, supported Web search keys and OpenAPI authentication values use the `SecretVault` port backed by Obsidian SecretStorage. Saved configuration retains secret names. Arbitrary CLI/MCP environment values are not automatically secret-managed. Syncing configuration and provisioning a secret on another device are separate concerns; actual Sync behavior depends on host configuration.

## RAG and memory

`RAGManager` implements the knowledge and memory ports. The pipeline is note text → chunks → configured embeddings → local vector storage → retrieval → optional model grading. Content hashes and embedding model identity avoid incompatible/unchanged re-embedding. Storage mode, context limits and include/exclude rules affect runtime behavior. Enabled incremental embedding follows vault events.

The index is local; the embedding/grading providers may be remote. Agent memory is owner/mode scoped, with bounded retention; none skips memory access/writes for the run while retaining already stored data.

## Provider package

`provider-definitions.ts` is the shared construction/discovery registry. OpenAI-compatible, Anthropic, Google, Ollama and SAP paths use their applicable native protocols; capabilities depend on actual model/deployment support. Custom connection IDs disambiguate models exposed by multiple gateways.

`obsidian-http.ts` supplies the Obsidian transport. A renderer CORS failure may use buffered SSE through the host transport; the same response still requires valid terminal metadata. `resilient-http.ts` retries only operations that are retry-safe (safe methods by default or an explicit safe grant). A retryable status does not authorize replay of an arbitrary POST or generation stream.

The LLM Hub exposes a frozen capability facade without returning credentials/raw configuration. This is API encapsulation within a shared host, not protection against every other enabled plugin.

## UI and validation

`ChatView` composes controllers/renderers; the settings view keeps nine top-level Tabs plus their subtabs. This documentation update changes no UI code or styles.

Use [testing](../reference/testing.md) for the distinction between deterministic/mock suites, real component controls and frozen-bundle release gates. Source version 0.1.0 and the recorded 0.0.23 full real gate have separate provenance, described in [release status](../releases/0.1.0.md). Historical design plans are not current runtime guarantees.
