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

UI code receives a `PluginHost` (`ui/plugin-host.ts`: app, manifest, settings, services, `updateSettings`, `saveSettings`) instead of the plugin class; only the settings tab, the chat view and the chat session controller see the plugin itself.

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

**settings**: `SettingsStore` loads, migrates (`settings-migrations.ts`) and saves settings. API keys live in Obsidian's secret storage behind the `SecretVault` port (`settings-secrets.ts`, adapter `adapters/obsidian/obsidian-secret-vault.ts`): settings keep the secret's name, the store fills in the key on load and strips it from every write. Settings are stored in the plugin's `data.json` as one document (`settings-document.ts`: config, providers, prompts, agents), so Obsidian Sync carries them and `onExternalSettingsChange` reloads them. A save happens only when a unit (`config`, `providers`, `prompts`, `agents`, `mcp`) changed, and `onChange` subscribers learn which; the plugin uses that to refresh RAG and the chat model list. Model and MCP tool caches stay in `data/cache/`. Settings saved by older versions in `config/user/settings.json` and `data/` files move into `data.json` on first load (`adapters/persistence/legacy-settings-files.ts`). `types/settings.ts` holds `PluginSettings`.

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
- `chat/controllers/` — `ChatController` (send, stream, live agent trace) and `InputController`.
- `chat/managers/conversation-manager.ts` and `chat/conversation-list-view.ts` — the conversation sidebar.
- `settings/settings-tab.ts` — the settings UI uses Obsidian's declarative settings (1.13+): the general settings are `control` definitions, so they appear in Obsidian's settings search, and every other section is a native page (`settings/section-page.ts`) that renders its renderer from `settings/tabs/`. `settings/settings-form.ts` binds a settings section to toggle, dropdown, text, number, list and secret fields with one save path.
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
