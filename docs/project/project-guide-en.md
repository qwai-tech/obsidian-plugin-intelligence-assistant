# Project Guide

This document is a developer-oriented guide to the `obsidian-plugin-intelligence-assistant` repository. It complements the user-facing [README](../../README.md) and the architecture notes under `docs/architecture/` — start with the [architecture overview](../architecture/overview-en.md).

## What This Plugin Does

Intelligence Assistant turns an Obsidian vault into a local AI workspace. The plugin combines:

- Multi-provider LLM chat with streaming responses
- Reusable custom agents that work in turns with tools
- MCP, OpenAPI and CLI tool integration
- RAG over vault content with local vector storage
- Web search
- Quick actions and editor-side AI helpers

## Codebase Shape

- `main.ts`: the Obsidian `Plugin` — loads settings, registers views and the settings tab, then calls the composition root
- `src/bootstrap`: composition root; builds every service once
- `src/application`: use cases and the ports they own — agents (turn kernel), chat, settings store, tools, web search
- `src/infrastructure`: adapters — JSON/JSONL persistence, RAG, vector store, embeddings, Obsidian file system
- `src/presentation`: chat view, settings tabs, modals, controllers, state
- `src/core`, `src/types`, `src/utils`: plugin paths, shared interfaces and data shapes, small helpers
- `packages/obsidian-llm`: LLM providers, the HTTP port and the model manager (`@qwai/obsidian-llm`)

Layer boundaries are enforced by lint (`no-restricted-imports` in `eslint.config.mts`).

## Main Runtime Flows

### Startup

On load, the plugin:

1. Registers the chat view, commands, ribbon icon and settings tab
2. Loads settings through `SettingsStore` (user config, repository files, migrations)
3. Builds services in [`src/bootstrap/create-services.ts`](../../src/bootstrap/create-services.ts) and resolves `whenServicesReady()`
4. Runs deferred work: conversation migration, default-agent seeding, tool source loading (built-in, CLI, OpenAPI, MCP auto-connect)

### Chat Request Lifecycle

[`chat-view.ts`](../../src/presentation/views/chat-view.ts) collects text, attachments and references; [`ChatController`](../../src/presentation/components/chat/controllers/chat-controller.ts) sends them:

- Chat mode: [`ChatService`](../../src/application/services/chat.service.ts) adds RAG and web search context and streams the reply
- Agent mode: [`AgentEngineLoop`](../../src/application/agents/agent-engine-loop.ts) runs the [`TurnKernel`](../../src/application/agents/kernel/turn-kernel.ts); tool calls appear live in the chat
- Stop cancels the request through an `AbortSignal`
- The conversation is saved after the reply

### Tooling Pipeline

[`ToolSourceManager`](../../src/application/tools/tool-source-manager.ts) loads tool sources into the [`ToolRegistry`](../../src/application/tools/tool-registry.ts):

- Built-in vault tools ([`builtin-tool-source.ts`](../../src/application/tools/sources/builtin-tool-source.ts))
- MCP servers, wrapped as tools
- OpenAPI specs converted into tools
- CLI tools from presets or user config

Each tool declares its side effects; agents only see the tools their `toolAccess` grants.

### RAG Pipeline

[`RAGManager`](../../src/infrastructure/rag-manager.ts) indexes vault notes into the [`VectorStore`](../../src/infrastructure/vector-store.ts): notes → chunks ([`chunker.ts`](../../src/infrastructure/rag/chunker.ts)) → embeddings → local index → similarity search → optional grading. Unchanged notes are skipped by content hash. Chat and agents reach it through the `KnowledgeBase` port.

## Persistence Model

- User config file: normalized settings (`SettingsStore`, `settings-codec.ts`)
- Repository JSON files: providers, prompts, agents, model caches, MCP servers and tool caches, token usage, agent memory
- Conversations: one JSON file per conversation
- Agent runs: one JSONL journal per run
- Vector index: RAG chunks and embeddings

All paths come from [`pluginPaths(configDir)`](../../src/core/plugin-paths.ts). Writes are atomic (temp file, then rename).

## Important Modules To Read First

1. [`main.ts`](../../main.ts)
2. [`src/bootstrap/create-services.ts`](../../src/bootstrap/create-services.ts)
3. [`src/application/settings/settings-store.ts`](../../src/application/settings/settings-store.ts)
4. [`src/presentation/views/chat-view.ts`](../../src/presentation/views/chat-view.ts)
5. [`src/application/agents/kernel/turn-kernel.ts`](../../src/application/agents/kernel/turn-kernel.ts)
6. [`src/application/tools/tool-source-manager.ts`](../../src/application/tools/tool-source-manager.ts)
7. [`packages/obsidian-llm/src/model-manager.ts`](../../packages/obsidian-llm/src/model-manager.ts)

## Known Engineering Hotspots

- Several UI modules are still large (`agent-edit-modal.ts`, `mcp-inspector`, `message-renderer.ts`, `cli-tools-section.ts`).
- MCP, OpenAPI and RAG all add asynchronous startup work; regressions often appear as initialization-order bugs.

## Suggested Development Workflow

1. Read the relevant runtime path.
2. Write or update the test first (`npx jest`, missions in `tests/missions`).
3. Run `npm run lint`.
4. Run `npm run build` and `node scripts/deploy.js --local`.
5. For UI or storage changes, run `npm run test:e2e`.

## Extension Guidance

- New LLM providers belong in `packages/obsidian-llm/src/providers/`; OpenAI-compatible APIs can subclass `OpenAICompatibleProvider`.
- New built-in tools are implemented in `src/application/services/*-tools.ts`, registered in `builtin-tool-source.ts`, and must declare their side effects.
- New settings need the type, codec and migration updates, plus a field in the relevant tab (`SettingsForm` for simple fields).
- New ports belong to the layer that consumes them; adapters implement them structurally.
