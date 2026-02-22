# Project Structure

Full annotated source tree for the Intelligence Assistant plugin.

## Root

```
obsidian-plugin-intelligence-assistant/
├── main.ts                  # Plugin entry point (Obsidian bootstrap)
├── main.js                  # Compiled output (loaded by Obsidian)
├── styles.css               # All CSS — auto-loaded by Obsidian
├── manifest.json            # Plugin manifest (id, version, minAppVersion)
├── package.json             # npm config, scripts, dependencies
├── tsconfig.json            # TypeScript config
├── jest.config.js           # Jest configuration
├── scripts/                 # Build, dev, deploy, version, clean scripts
├── docs/                    # Documentation hub (this folder)
│   ├── README.md            # Doc index
│   ├── architecture/        # Architecture overviews
│   └── reference/           # API and structure reference
└── src/                     # All TypeScript source
```

## `src/` — source tree

### `src/core/` — Infrastructure core

```
core/
├── container.ts             # Dependency injection container (singleton/transient)
├── event-bus.ts             # Async/sync event bus with 30+ plugin events
├── error-handler.ts         # Centralized error processing
├── errors.ts                # Custom error hierarchy
├── config-manager.ts        # Settings CRUD with path-based access + validation
├── config-schema.ts         # Schema definitions for config validation
├── performance-monitor.ts   # Operation timing
├── service-registry.ts      # Service registration helpers
├── interfaces/
│   ├── repository.interface.ts
│   └── service.interface.ts
└── types/
    ├── common.types.ts
    ├── event.types.ts
    └── result.types.ts
```

### `src/domain/` — Domain models

```
domain/
├── agent/
│   ├── agent.model.ts       # Agent domain model (validation, serialization)
│   └── agent-templates.ts   # Default agent templates
└── chat/
    └── entities/
        ├── conversation.model.ts  # Conversation aggregate
        └── message.entity.ts      # Message value object
```

### `src/application/` — Application services

```
application/
└── services/
    ├── chat.service.ts              # Message routing, streaming orchestration
    ├── llm-service.ts               # Provider selection, model resolution
    ├── agent-service.ts             # Agent CRUD and selection
    ├── mcp-client.ts                # MCP protocol client
    ├── mcp-service.ts               # MCP server lifecycle + tool catalog
    ├── mcp-tool-wrapper.ts          # Adapt MCP tools to agent tool interface
    ├── rag-service.ts               # Vault indexing orchestration
    ├── web-search-service.ts        # Provider-agnostic web search
    ├── tool-manager.ts              # Register and dispatch all tool types
    ├── conversation-storage-service.ts  # Conversation persistence
    ├── conversation-migration-service.ts # Conversation format migration
    ├── memory-service.ts            # Agent memory read/write
    ├── cli-tool.ts                  # CLI tool type definitions
    ├── cli-tool-loader.ts           # Load and register CLI tools
    ├── openapi-tool-loader.ts       # Parse OpenAPI specs into agent tools
    ├── file-tools.ts                # Built-in file tools
    ├── search-tools.ts              # Built-in search tools
    └── base-service.ts              # Abstract base service class
```

### `src/infrastructure/` — External adapters

```
infrastructure/
├── llm/
│   ├── base-provider.interface.ts   # LLM provider interface
│   ├── base-provider.ts             # Common provider utilities
│   ├── base-streaming-provider.ts   # Streaming base (handles SSE, tool calls)
│   ├── provider-factory.ts          # Create provider instances
│   ├── provider-registry.ts         # Register known providers
│   ├── model-manager.ts             # Model catalog management
│   ├── openai-provider.ts
│   ├── anthropic-provider.ts
│   ├── google-provider.ts
│   ├── deepseek-provider.ts
│   ├── ollama-provider.ts
│   ├── openrouter-provider.ts
│   ├── sap-ai-core-provider.ts
│   └── types.ts
│
├── cli-agent/
│   ├── cli-agent-service.ts         # Build SDK inputs; spawn bridge process
│   ├── sdk-bridge.ts                # Template → sdk-bridge.mjs (auto-written)
│   ├── sdk-installer.ts             # On-demand npm install for CLI SDKs
│   └── shell-env.ts                 # Source login shell PATH (nvm, Homebrew)
│
├── persistence/
│   ├── data/                        # JSON-file repositories
│   │   ├── agent-repository.ts
│   │   ├── prompt-repository.ts
│   │   ├── provider-repository.ts
│   │   ├── mcp-server-repository.ts
│   │   ├── mcp-tool-cache-repository.ts
│   │   └── model-cache-repository.ts
│   └── obsidian/                    # Vault-based repositories
│       ├── base-obsidian-repository.ts
│       ├── conversation-repository.ts
│       └── message-repository.ts
│
├── rag-manager.ts                   # RAG coordination (load → chunk → embed → index)
├── vector-store.ts                  # Cosine-similarity nearest-neighbour vector store
├── embedding-manager.ts             # Embedding model management
├── embedding-worker.ts              # Embedding computation worker
└── document-grader.ts               # Relevance filter before context injection
```

### `src/presentation/` — UI layer

```
presentation/
├── views/
│   └── chat-view.ts                 # Main ItemView — root DOM + controller wiring
│
├── components/
│   ├── chat/
│   │   ├── chat-view.component.ts   # Chat component bootstrap
│   │   ├── chat-header.ts           # Top toolbar (mode, agent, model, controls)
│   │   ├── message-list.component.ts
│   │   ├── message-renderer.ts      # Markdown → DOM, code blocks, tool results
│   │   ├── controllers/
│   │   │   ├── base-controller.ts
│   │   │   ├── chat-controller.ts   # Send/regenerate/stop message
│   │   │   ├── message-controller.ts # Display messages
│   │   │   ├── agent-controller.ts  # Agent selection
│   │   │   └── input-controller.ts  # Input, attachments, @mentions
│   │   ├── handlers/
│   │   │   ├── streaming-handler.ts # Streaming UI + auto-scroll logic
│   │   │   ├── tool-call-handler.ts # Tool-call accordion UI
│   │   │   └── attachment-handler.ts # File/image attachment UI
│   │   ├── managers/
│   │   │   └── conversation-manager.ts # Conversation CRUD, history, persistence
│   │   └── utils/
│   │       ├── dom-helpers.ts
│   │       └── provider-utils.ts
│   │
│   ├── tabs/
│   │   ├── general-tab.ts
│   │   ├── llm-tab.ts
│   │   ├── models-tab.ts
│   │   ├── provider-tab.ts
│   │   ├── agents-tab.ts
│   │   ├── cli-agents-tab.ts        # CLI agent management + auto-detection panel
│   │   ├── prompts-tab.ts
│   │   ├── tools-tab.ts
│   │   ├── mcp-tab.ts
│   │   ├── rag-tab.ts
│   │   ├── websearch-tab.ts
│   │   ├── quickactions-tab.ts
│   │   └── base-tab.ts
│   │
│   ├── modals/
│   │   ├── cli-agent-edit-modal.ts  # Thin-bridge CLI agent config modal
│   │   ├── agent-edit-modal.ts
│   │   ├── mcp-server-modal.ts
│   │   ├── mcp-inspector-modal.ts   # Live MCP tool tester
│   │   ├── provider-config-modal.ts
│   │   ├── sdk-install-modal.ts     # CLI SDK install progress UI
│   │   ├── ollama-model-manager-modal.ts
│   │   ├── prompt-modal.ts
│   │   ├── system-prompt-edit-modal.ts
│   │   ├── confirm-modal.ts
│   │   └── explain-text-modal.ts
│   │
│   ├── settings-tab.ts              # Root settings tab + migration logic
│   └── components/
│       ├── provider-meta.ts
│       └── dom-helpers.ts
│
├── state/
│   ├── chat-view-state.ts           # ChatViewState — reactive chat state
│   └── chat.state.ts
│
└── utils/
    ├── config-field-metadata.ts
    └── ui-helpers.ts
```

### `src/types/` — Type definitions

```
types/
├── index.ts                  # Single export point for all types
├── settings.ts               # PluginSettings — root persisted settings schema
├── type-utils.ts             # TypeScript utility types
├── augmentations.d.ts        # Global augmentations
├── core/
│   ├── agent.ts              # Agent, AgentConfig
│   ├── cli-agent.ts          # CLIAgentConfig, CLIAgentProvider, migration helpers
│   ├── conversation.ts       # Conversation, Message
│   └── model.ts              # ModelInfo, LLMConfig
├── features/
│   ├── mcp.ts                # MCPServer, MCPTool
│   ├── rag.ts                # RAGConfig, DocumentChunk
│   ├── web-search.ts         # WebSearchConfig, WebSearchProvider
│   ├── memory.ts             # AgentMemory
│   ├── think.ts              # ThinkingConfig
│   ├── cli-tools.ts          # CLIToolDefinition
│   └── openapi-tools.ts      # OpenAPIToolSource
└── common/
    ├── llm.ts                # LLMMessage, StreamChunk
    ├── tools.ts              # ToolDefinition, ToolResult
    ├── attachments.ts        # FileReference, ImageAttachment
    └── reasoning.ts          # AgentExecutionStep
```

### `src/utils/` — General utilities

```
utils/
├── error-handler.ts          # App-level error formatting
├── file-system.ts            # Vault file helpers
├── logger.ts                 # Structured logging
├── type-guards.ts            # TypeScript type guards
└── ui-helpers.ts             # DOM/Obsidian UI helpers
```

### `src/memory/`

```
memory/
└── agent-memory.ts           # Agent memory persistence (per-agent JSON)
```

## Naming conventions

| File pattern | Used for |
|---|---|
| `*.model.ts` | Domain models (`agent.model.ts`) |
| `*-controller.ts` | MVC controllers |
| `*-service.ts` | Application services |
| `*-handler.ts` | Event/UI handlers |
| `*-manager.ts` | Stateful coordinators |
| `*-repository.ts` | Data access objects |
| `*-provider.ts` | LLM provider adapters |
| `*-tab.ts` | Settings tab components |
| `*-modal.ts` | Modal components |
| `*.test.ts` | Jest test files |

## Build output

The plugin compiles to a single `main.js` at the vault's plugin directory root. `styles.css` is copied alongside it. Both are read directly by Obsidian.

## Configuration files

| File | Purpose |
|---|---|
| `tsconfig.json` | TypeScript compiler — path aliases (`@/` → `src/`), strict mode |
| `jest.config.js` | Jest — ts-jest transform, jsdom environment, module name mapper |
| `scripts/build.js` | esbuild production bundle |
| `scripts/dev.js` | esbuild dev watcher with optional vault deploy |
| `manifest.json` | Obsidian manifest — id, version, minAppVersion |
