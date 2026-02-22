# Architecture Overview

Intelligence Assistant follows a **layered hexagonal architecture** (Ports and Adapters) with six top-level namespaces inside `src/`. Dependencies flow strictly from outer layers inward; inner layers never reference outer ones.

## Layer diagram

```
┌─────────────────────────────────────────────────────┐
│                  Presentation                        │
│   Views · Components · Controllers · Handlers        │
│   Settings tabs · Modals · State                     │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                  Application                         │
│   Services (chat, LLM, MCP, RAG, agents, tools,     │
│   web search, conversation storage, memory)          │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                 Infrastructure                       │
│   LLM providers · CLI agent SDK bridge · Persistence │
│   RAG / vector store · Embedding · Document grader   │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                    Domain                            │
│   Agent model · Conversation model · Message entity  │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                     Core                             │
│   DI Container · Event bus · Error handling          │
│   Config manager · Performance monitor               │
└─────────────────────────────────────────────────────┘
```

## Namespaces

### `src/core/`

Fundamental cross-cutting infrastructure:

- **`container.ts`** — Dependency injection. Supports singleton and transient registration. All application services are resolved through the container.
- **`event-bus.ts`** — Async/sync event communication. 30+ named events across messages, conversations, agents, tools, RAG, MCP, and system lifecycle.
- **`error-handler.ts`** / **`errors.ts`** — Custom error hierarchy (`PluginError`, `ConfigurationError`, `NetworkError`, `StorageError`, `ToolError`, `ValidationError`) plus centralized error processing.
- **`config-manager.ts`** / **`config-schema.ts`** — Centralized settings CRUD with schema validation, migration support, path-based nested access, and change tracking.
- **`performance-monitor.ts`** — Lightweight operation timing.

### `src/domain/`

Pure business models with no framework dependencies:

- **`domain/agent/agent.model.ts`** — Agent configuration model: validation, serialization, factory methods.
- **`domain/chat/entities/conversation.model.ts`** — Conversation aggregate with message list, token counting, and summary generation.
- **`domain/chat/entities/message.entity.ts`** — Message value object.

### `src/application/`

Orchestration services that coordinate domain models and infrastructure:

| Service | Responsibility |
|---------|---------------|
| `chat.service.ts` | Message routing, streaming, tool call execution |
| `llm-service.ts` | Provider selection, model resolution |
| `agent-service.ts` | Agent CRUD and selection |
| `mcp-service.ts` / `mcp-client.ts` | MCP server lifecycle, tool catalog |
| `mcp-tool-wrapper.ts` | Adapt MCP tools to agent tool interface |
| `rag-service.ts` | Vault indexing orchestration |
| `web-search-service.ts` | Provider-agnostic web search |
| `tool-manager.ts` | Register and route all tool types |
| `conversation-storage-service.ts` | Persist / restore conversations |
| `conversation-migration-service.ts` | Migrate old conversation formats |
| `memory-service.ts` | Agent memory read/write |
| `cli-tool.ts` / `cli-tool-loader.ts` | Native CLI tool definitions |
| `openapi-tool-loader.ts` | Parse OpenAPI specs into agent tools |
| `file-tools.ts` / `search-tools.ts` | Built-in file and search tools |

### `src/infrastructure/`

Adapters to external systems:

**LLM providers** (`infrastructure/llm/`):

| Provider | File |
|----------|------|
| OpenAI | `openai-provider.ts` |
| Anthropic | `anthropic-provider.ts` |
| Google Gemini | `google-provider.ts` |
| DeepSeek | `deepseek-provider.ts` |
| Ollama | `ollama-provider.ts` |
| OpenRouter | `openrouter-provider.ts` |
| SAP AI Core | `sap-ai-core-provider.ts` |

All providers extend `base-streaming-provider.ts`, which handles chunked streaming, tool-call accumulation, and error normalization. Every provider implements `base-provider.interface.ts`.

**CLI agent bridge** (`infrastructure/cli-agent/`):

```
┌─────────────────────────────────────┐
│  Plugin process (Electron renderer)  │
│  cli-agent-service.ts               │
│  → spawn Node.js child process      │
└────────────────┬────────────────────┘
                 │ stdin (JSON input)
                 │ stdout (JSON lines)
┌────────────────▼────────────────────┐
│  sdk-bridge.mjs  (plain Node.js)    │
│  → import('@anthropic-ai/claude-...')│
│  → import('@openai/codex-sdk')      │
│  → import('@qwen-code/sdk')         │
└─────────────────────────────────────┘
```

Electron's renderer cannot `import()` ESM bare specifiers or `require()` `.mjs` files. The bridge runs in a plain Node.js child process where dynamic `import()` works normally. The plugin writes `sdk-bridge.mjs` to the plugin directory on startup and spawns it via `node` (without `shell: true` to avoid path-with-spaces issues on macOS iCloud vaults).

- **`cli-agent-service.ts`** — Builds SDK input objects and streams events back to the plugin.
- **`sdk-bridge.ts`** — Template for `sdk-bridge.mjs`; auto-written if missing or stale.
- **`sdk-installer.ts`** — On-demand `npm install --prefix <plugin-dir>` for each CLI SDK.
- **`shell-env.ts`** — Sources the user's login shell to get a complete `PATH` (handles nvm, Homebrew, etc.).

**Persistence** (`infrastructure/persistence/`):

- `data/` repositories — JSON-file storage for agents, prompts, providers, MCP servers, model cache, and MCP tool cache.
- `obsidian/` repositories — Obsidian vault-based storage for conversations and messages.

**RAG** (`infrastructure/rag-manager.ts`, `vector-store.ts`, `embedding-manager.ts`, `embedding-worker.ts`, `document-grader.ts`):

Vault indexing pipeline: load → chunk → embed → store in a local JSON vector index. Retrieval uses cosine-similarity nearest-neighbour search. A document grader filters chunks by relevance before injection into context.

### `src/presentation/`

All UI code. Follows an MVC pattern inside the chat view.

**Views** (`presentation/views/`):

- `chat-view.ts` — Main `ItemView`. Owns the root DOM, delegates to controllers and handlers.

**Chat component subtree** (`presentation/components/chat/`):

| Folder | Responsibility |
|--------|---------------|
| `controllers/` | `ChatController`, `MessageController`, `AgentController`, `InputController`, `BaseController` |
| `handlers/` | `StreamingHandler` (streaming + auto-scroll), `ToolCallHandler` (tool-call UI), `AttachmentHandler` (file/image input) |
| `managers/` | `ConversationManager` (conversation CRUD, history, persistence) |
| `message-renderer.ts` | Markdown → DOM, code blocks, tool results |
| `chat-header.ts` | Top toolbar (mode, agent/prompt picker, model, controls) |

**Settings tabs** (`presentation/components/tabs/`):

`GeneralTab`, `LLMTab`, `ModelsTab`, `ProvidersTab`, `AgentsTab`, `CLIAgentsTab`, `PromptsTab`, `ToolsTab`, `MCPTab`, `RAGTab`, `WebSearchTab`, `QuickActionsTab`

**Modals** (`presentation/components/modals/`):

`CLIAgentEditModal`, `AgentEditModal`, `MCPServerModal`, `MCPInspectorModal`, `ProviderConfigModal`, `SDKInstallModal`, `OllamaModelManagerModal`, `PromptModal`, `SystemPromptEditModal`, `ConfirmModal`, `ExplainTextModal`

**State** (`presentation/state/`):

`ChatViewState` — reactive state container for the chat view (current conversation, agent, mode, streaming flags, etc.).

### `src/types/`

All TypeScript type definitions, exported from a single `index.ts`:

```
types/
├── core/          agent.ts · cli-agent.ts · conversation.ts · model.ts
├── features/      mcp.ts · rag.ts · web-search.ts · memory.ts · think.ts · cli-tools.ts · openapi-tools.ts
├── common/        llm.ts · tools.ts · attachments.ts · reasoning.ts
└── settings.ts    PluginSettings — the root settings schema persisted to data.json
```

## Key design decisions

### Thin CLI bridge

CLI agents (Claude Code, Codex, Qwen Code) each have a rich native configuration ecosystem (`CLAUDE.md`, `.claude/settings.json`, `AGENTS.md`, `.codex/config.toml`, `QWEN.md`, `.qwen/settings.json`). Rather than duplicating these settings in the plugin, `CLIAgentConfig` stores only orchestration-level fields (provider, model, permission mode, working directory, auth override, budget cap). When `useProjectSettings` is `true` (default), Claude Code SDK receives `settingSources: ["project"]`, enabling it to load its native config automatically. Codex and Qwen Code read their project configs by default.

### Settings schema and migration

`types/settings.ts` defines `PluginSettings` as the single source of truth for all persisted state. `settings-tab.ts` holds migration logic (`userConfigToPluginSettings`) that upgrades data from previous formats (e.g., the old two-tier `CLIProviderConfig` + `CLIAgentConfig` structure).

### No dynamic imports in Electron renderer

Electron's Chromium-based renderer rejects `import()` with bare module specifiers and blocks `file://` URLs for local ESM. The SDK bridge pattern (child process + stdin/stdout JSON) is the workaround. All three CLI SDKs are ESM-only packages and must be loaded this way.
