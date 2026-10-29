# Architecture Overview

Intelligence Assistant is a layered, ports-and-adapters plugin. `main.ts` is a thin Obsidian `Plugin` that loads settings and hands off to the composition root in `src/bootstrap/`. LLM providers live in a separate package, `packages/obsidian-llm` (`@qwai/obsidian-llm`).

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│ main.ts → src/bootstrap/   composition root (builds everything)│
└───────────────┬───────────────────────────────────────────────┘
                │ wires
┌───────────────▼───────────────┐   ┌───────────────────────────┐
│ presentation/                 │   │ packages/obsidian-llm      │
│ views · components · modals   │   │ providers · HTTP port ·    │
│ settings tabs · state         │   │ model manager · LLM hub    │
└───────────────┬───────────────┘   └─────────────▲─────────────┘
                │ calls                           │ used by
┌───────────────▼─────────────────────────────────┴─────────────┐
│ application/   use cases + the ports they own                  │
│ agents (turn kernel) · chat · settings store · tools · search  │
└───────────────┬───────────────────────────────────────────────┘
                │ ports implemented by
┌───────────────▼───────────────────────────────────────────────┐
│ infrastructure/  adapters: JSON/JSONL persistence, RAG,        │
│ vector store, embeddings, Obsidian file system                 │
└───────────────┬───────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────┐
│ core/ · types/ · utils/ · constants   no outward dependencies  │
└───────────────────────────────────────────────────────────────┘
```

The import rules are enforced by `no-restricted-imports` blocks in `eslint.config.mts`, with no exemptions:

| Layer | May not import |
|-------|----------------|
| `core/`, `types/`, `utils/`, `constants.ts`, `i18n/` | application, infrastructure, presentation |
| `application/` | infrastructure, presentation |
| `infrastructure/` | application, presentation |
| `packages/obsidian-llm` | anything from the plugin (`@/*`) |

`bootstrap/` and `main.ts` are the only places that see every layer.

## Composition root — `src/bootstrap/`

- `create-services.ts` builds every service once and returns `OwnedServices`; the UI receives the narrower `AppServices` interface (`presentation/app-services.ts`).
- `obsidian-settings-persistence.ts` and `plugin-data-service.ts` adapt the settings store to the plugin's JSON files.
- `tool-source-factory.ts` creates built-in, CLI, OpenAPI and MCP tool sources.
- `agent-entry-points.ts` and `plugin-integrations.ts` register commands, the inline AI block, deep links and RAG indexing on vault events.

`ChatView.onOpen` awaits `plugin.whenServicesReady()`, so views never construct services.

## Application — `src/application/`

**Settings** (`settings/`): `SettingsStore` loads, migrates (`settings-migrations.ts`) and saves settings. A save writes only the units that changed (`config`, `providers`, `prompts`, `agents`, `mcp`) and notifies `onChange` subscribers; the plugin uses that to refresh RAG and the chat model list.

**Agents** (`agents/`):

- `kernel/turn-kernel.ts` — the agent loop. A turn is one model call plus its whole batch of tool calls. Ports: `ContextAssembler`, `ModelPort`, `ToolRunner`, `TurnGuard`.
- `kernel/budget.ts` — step and failure budget; the agent may raise its step budget with an `ESTIMATED_STEPS` marker on the first turn. Runs end with a typed `FinishReason`.
- `kernel/turn-guards.ts` — named retry rules (empty turn, missing write proposal) that appear in the trace.
- `agent-engine-loop.ts` — maps kernel events to chat callbacks and writes the run journal.
- `agent-sense-service.ts` — gathers the active note, references, graph neighbours, RAG hits and agent memory.

Contracts shared with infrastructure (`KernelEvent`, `FinishReason`, `RunJournal`) live in `types/features/agent-run.ts`. See ADR-001 and ADR-002.

**Chat and search** (`services/`): `chat.service.ts` streams chat-mode replies and routes agent mode to the engine loop. `chat-session-policy.ts` decides the active mode, agent, prompt and agent model. `web-search-service.ts` dispatches to the backends in `web-search/backends.ts`. `conversation-namer.ts` generates titles and icons.

**Tools** (`tools/`): `ToolRegistry` holds every tool; `ToolSourceManager` loads and reloads the built-in, CLI, OpenAPI and MCP sources. Tools declare side effects (`ToolSideEffects`, including `process` for CLI and MCP tools), which drive the capability summary and the autonomy rules.

**Ports owned here**: `KnowledgeBase` and `MemoryIndex` (`services/knowledge-base.ts`), `AgentMemoryStore`, `ExportTargetPicker`, `SettingsPersistence`, and the kernel ports above.

## Infrastructure — `src/infrastructure/`

- `persistence/json-file.ts` — atomic JSON writes (temp file, then rename) with recovery of a leftover temp file; `json-collection.ts` stores an index plus one file per item. Every repository in `persistence/data/` is built on these.
- `persistence/jsonl-run-journal.ts` — appends one JSON line per agent event.
- `persistence/conversation-storage-service.ts` — conversations as per-file JSON.
- `rag-manager.ts`, `vector-store.ts`, `rag/chunker.ts`, `embedding-manager.ts`, `document-grader.ts` — vault indexing and retrieval. Chunks record a content hash and the embedding model, so unchanged notes are not re-embedded and searches only compare vectors from the same model. `RAGManager` implements `KnowledgeBase` and `MemoryIndex`.

All plugin paths come from `core/plugin-paths.ts` (`pluginPaths(configDir)`), so the vault's real config folder is used.

## LLM package — `packages/obsidian-llm`

- `http.ts` / `obsidian-http.ts` — the `HttpPort`; `resilient-http.ts` adds timeout, retries on 429/502/503/504 and transport errors, and `AbortSignal` cancellation.
- `base-streaming-provider.ts` — SSE streaming with a fresh chunk parser per stream.
- `providers/openai-compatible-provider.ts` — shared base for OpenAI, DeepSeek and OpenRouter. Anthropic, Gemini and Ollama implement tool calling natively. SAP AI Core uses buffered SSE helpers in `sap-sse.ts`.
- `model-manager.ts` — one model cache per provider config, with de-duplicated in-flight requests.
- `hub.ts` — the cross-plugin LLM hub, which lends model access without exposing keys.

## Presentation — `src/presentation/`

- `views/chat-view.ts` — the chat `ItemView`; it composes the header, input, message list and conversation sidebar. `views/chat-workspace.ts` opens and finds chat leaves; `views/agent-task-launcher.ts` starts agent tasks from commands.
- `components/chat/chat-session-controller.ts` — applies mode, agent, conversation config and quick toggles to the view.
- `components/chat/controllers/` — `ChatController` (send, stream, live agent trace) and `InputController`.
- `components/chat/managers/conversation-manager.ts` and `conversation-list-view.ts` — the conversation sidebar.
- `components/settings/settings-form.ts` — `SettingsForm` binds a settings section to toggle, dropdown, text, number and list fields with one save path.
- `components/tabs/` — settings tabs; `components/modals/` — dialogs.
- `state/chat-view-state.ts` — per-view state, including the `AbortController` for the running request.

## Types — `src/types/`

Interfaces and plain data shapes only: `core/` (agent, conversation, model), `common/` (LLM, tools, attachments, reasoning), `features/` (agent-run, cli-tools, mcp, memory, openapi-tools, rag, usage, web-search) and `settings.ts` (`PluginSettings`). Behaviour lives in the layers above.

## Testing

- `npx jest` — unit tests (jsdom, Obsidian mock in `__mocks__/obsidian.ts`).
- `npx jest tests/harness tests/missions --runInBand` — agent missions against a mock LLM and an in-memory vault.
- `npm run test:e2e` — WebdriverIO against a real Obsidian build.

## Design notes

- **No dynamic imports in the Electron renderer.** Chromium rejects `import()` with bare specifiers and blocks `file://` ESM, so ESM-only packages need bundling.
- **Settings are diffed, not rewritten.** Callers mutate `plugin.settings` and call `saveSettings()`; the store writes only changed units, so redundant saves are cheap.
