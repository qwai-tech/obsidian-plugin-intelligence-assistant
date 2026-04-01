# Project Guide

This document is a developer-oriented guide to the `obsidian-plugin-intelligence-assistant` repository. It complements the user-facing [README](../../README.md) and the high-level architecture notes under `docs/architecture/`.

## What This Plugin Does

Intelligence Assistant turns an Obsidian vault into a local AI workspace. The plugin combines:

- Multi-provider LLM chat with streaming responses
- Reusable custom agents and CLI-backed coding agents
- MCP tool integration
- RAG over vault content with local vector storage
- Web search and OpenAPI-derived tools
- Quick actions and editor-side AI helpers

The codebase is large because it mixes product UI, provider integrations, persistence, and several ongoing refactors.

## Current Codebase Shape

The repository broadly follows a layered design:

- `main.ts`: plugin bootstrap, settings load/save, view registration, deferred startup tasks
- `src/core`: container, config schema/manager, event bus, error handling, shared primitives
- `src/domain`: conversation and agent domain models
- `src/application/services`: orchestration logic for chat, tools, MCP, RAG, storage, memory, OpenAPI, web search
- `src/infrastructure`: adapters for LLM providers, CLI SDK bridge, persistence, RAG/vector store internals
- `src/presentation`: chat view, settings tabs, modals, controllers, handlers, state objects
- `src/types`: shared plugin settings and feature types

One important reality: the repository contains both the production chat implementation in [`chat-view.ts`](../../src/presentation/views/chat-view.ts) and an incomplete MVC-style subtree under `src/presentation/components/chat/`. That subtree is useful context, but not every class there is fully wired into runtime behavior.

## Main Runtime Flows

### Startup

On load, the plugin:

1. Initializes repositories and storage services
2. Loads settings from the user config and legacy plugin data
3. Hydrates prompts, agents, providers, model caches, and MCP server data
4. Registers the chat view, commands, ribbon icon, and settings tab
5. Runs deferred tasks such as conversation migration, default-agent seeding, MCP auto-connect, OpenAPI reload, and CLI tool reload

The main coordination logic lives in [`main.ts`](../../main.ts).

### Chat Request Lifecycle

The production chat flow centers on [`src/presentation/views/chat-view.ts`](../../src/presentation/views/chat-view.ts):

- Collect message text, attachments, and vault references
- Resolve active model, prompt, agent, and feature flags
- Optionally add RAG context and web search results
- Route the request through the selected provider or CLI bridge
- Stream partial output back into the chat UI
- Persist the updated conversation and messages

### Tooling Pipeline

Tool execution is unified through [`src/application/services/tool-manager.ts`](../../src/application/services/tool-manager.ts):

- Built-in tools are registered at startup
- MCP tools are wrapped and inserted dynamically
- OpenAPI specs are converted into executable tools
- CLI-specific tools can be loaded separately

This is the main extensibility seam for adding new tool classes.

### RAG Pipeline

RAG is implemented through:

- [`src/infrastructure/rag-manager.ts`](../../src/infrastructure/rag-manager.ts)
- [`src/infrastructure/vector-store.ts`](../../src/infrastructure/vector-store.ts)
- [`src/infrastructure/embedding-manager.ts`](../../src/infrastructure/embedding-manager.ts)
- [`src/infrastructure/document-grader.ts`](../../src/infrastructure/document-grader.ts)

The flow is: vault files -> chunking -> embeddings -> local vector index -> similarity search -> optional grading -> prompt injection.

## Persistence Model

The plugin persists data in more than one place:

- User settings file: normalized config written through the constants in `src/constants.ts`
- Repository-backed JSON data: prompts, providers, agents, model caches, MCP metadata
- Obsidian-vault storage: conversations and messages
- Local vector store: RAG chunk/embedding data

When changing settings or migrations, check both the normalized user config path and the repository-backed files. A bug in only one layer can produce silent drift.

## Important Modules To Read First

If you are new to the repository, read these files in order:

1. [`main.ts`](../../main.ts)
2. [`src/types/settings.ts`](../../src/types/settings.ts)
3. [`src/presentation/views/chat-view.ts`](../../src/presentation/views/chat-view.ts)
4. [`src/application/services/tool-manager.ts`](../../src/application/services/tool-manager.ts)
5. [`src/infrastructure/llm/model-manager.ts`](../../src/infrastructure/llm/model-manager.ts)
6. [`src/infrastructure/cli-agent/cli-agent-service.ts`](../../src/infrastructure/cli-agent/cli-agent-service.ts)
7. [`src/infrastructure/rag-manager.ts`](../../src/infrastructure/rag-manager.ts)

## Known Engineering Hotspots

- The codebase contains parallel implementations from an architecture migration; not every controller/service is production-critical.
- Settings persistence spans multiple stores, so migrations must be checked carefully.
- MCP, OpenAPI, CLI agents, and RAG all add asynchronous startup work; regressions often appear as initialization-order bugs.
- Some UI modules are very large and mix rendering, state mutation, and side effects.

## Suggested Development Workflow

Use this sequence for routine work:

1. Read the relevant runtime path, not just the architecture folder.
2. Update or add tests if the touched module already has coverage.
3. Run `npm run type-check`.
4. Run `npm run lint`.
5. Run `npm run build` before considering the change complete.

## Extension Guidance

- New LLM providers usually belong under `src/infrastructure/llm/` plus model-resolution updates.
- New built-in tools belong under `src/application/services/` and must be registered by `ToolManager`.
- New settings require updates to type definitions, config transforms, UI tabs, and persistence behavior.
- New chat-view features should be validated against the production `chat-view.ts` path, not only the controller subtree.
