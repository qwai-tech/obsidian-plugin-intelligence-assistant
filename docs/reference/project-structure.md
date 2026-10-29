# Project Structure

The source tree as of the global refactor. Roles of each layer and the import rules are in the [architecture overview](../architecture/overview-en.md). Tests (`__tests__/`), locale files and CSS are omitted.

## Root

```
obsidian-plugin-intelligence-assistant/
├── main.ts                  # Obsidian Plugin: settings, views, commands; calls src/bootstrap
├── manifest.json · package.json · tsconfig.json · jest.config.js · eslint.config.mts
├── styles.css               # Plugin CSS, loaded by Obsidian
├── scripts/                 # build.js (esbuild), dev, deploy, version
├── packages/obsidian-llm/   # LLM providers package (@qwai/obsidian-llm)
├── tests/                   # Missions harness, e2e (WebdriverIO), mutation, perf
├── docs/                    # Architecture, ADRs, guides
└── src/                     # Plugin source
```

## `src/`

```
src/
├── application/  # Use cases and the ports they own
│   ├── agents/  # Agent engine, sensing, capability summary
│   │   ├── kernel/  # Turn kernel, budget, guards, model/tool ports
│   │   │   ├── agent-message-history.ts
│   │   │   ├── budget.ts
│   │   │   ├── context-assembler.ts
│   │   │   ├── json-utils.ts
│   │   │   ├── provider-model-port.ts
│   │   │   ├── registry-tool-runner.ts
│   │   │   ├── turn-guards.ts
│   │   │   └── turn-kernel.ts
│   │   ├── presets/  # Built-in agents and prompts
│   │   │   ├── builtin-agents.ts
│   │   │   └── builtin-prompts.ts
│   │   ├── agent-capability-summary.ts
│   │   ├── agent-engine-loop.ts
│   │   ├── agent-sense-service.ts
│   │   ├── agent-task-text.ts
│   │   ├── history-compactor.ts
│   │   └── types.ts
│   ├── services/  # Chat, tools, search, memory, export and session policy
│   │   ├── web-search/  # Search backends and query heuristics
│   │   │   ├── backends.ts
│   │   │   └── query-heuristics.ts
│   │   ├── agent-memory-service.ts
│   │   ├── agent-service.ts
│   │   ├── canvas-tools.ts
│   │   ├── chat-session-policy.ts
│   │   ├── chat.service.ts
│   │   ├── cli-tool.ts
│   │   ├── conversation-namer.ts
│   │   ├── file-tools.ts
│   │   ├── knowledge-base.ts
│   │   ├── link-tools.ts
│   │   ├── llm-hub-service.ts
│   │   ├── mcp-client.ts
│   │   ├── mcp-tool-wrapper.ts
│   │   ├── obsidian-agent-prompts.ts
│   │   ├── obsidian-context-builder.ts
│   │   ├── ollama-admin.ts
│   │   ├── pdf-tools.ts
│   │   ├── run-activity.ts
│   │   ├── search-tools.ts
│   │   ├── settings-reload.ts
│   │   ├── subprocess-env.ts
│   │   ├── tag-tools.ts
│   │   ├── types.ts
│   │   ├── vault-export-service.ts
│   │   ├── web-search-service.ts
│   │   └── write-proposal-service.ts
│   ├── settings/  # Settings store, codec and migrations
│   │   ├── settings-codec.ts
│   │   ├── settings-migrations.ts
│   │   └── settings-store.ts
│   └── tools/  # Tool registry, sources and presets
│       ├── sources/  # Built-in, CLI, MCP and OpenAPI tool sources
│       │   ├── builtin-tool-source.ts
│       │   ├── cli-tool-source.ts
│       │   ├── mcp-tool-source.ts
│       │   ├── openapi-loader-core.ts
│       │   └── openapi-tool-source.ts
│       ├── cli-tool-presets.ts
│       ├── mcp-helpers.ts
│       ├── tool-migrations.ts
│       ├── tool-registry.ts
│       ├── tool-schema.ts
│       ├── tool-source-manager.ts
│       └── tool-source.ts
├── bootstrap/  # Composition root: builds and wires services
│   ├── agent-entry-points.ts
│   ├── create-services.ts
│   ├── obsidian-settings-persistence.ts
│   ├── plugin-data-service.ts
│   ├── plugin-integrations.ts
│   └── tool-source-factory.ts
├── capabilities/  # Obsidian API capability manifest
│   └── capability-manifest.ts
├── core/  # Plugin paths and core interfaces
│   ├── interfaces/
│   │   └── file-system.interface.ts
│   └── plugin-paths.ts
├── i18n/  # Translations
│   └── index.ts
├── infrastructure/  # Adapters: RAG, vector store, embeddings
│   ├── obsidian/  # Obsidian file-system adapter
│   │   └── obsidian-file-system.ts
│   ├── persistence/  # Atomic JSON files, JSONL run journal, conversations
│   │   ├── data/  # Repositories for settings data
│   │   │   ├── agent-memory-repository.ts
│   │   │   ├── agent-repository.ts
│   │   │   ├── mcp-server-repository.ts
│   │   │   ├── mcp-tool-cache-repository.ts
│   │   │   ├── model-cache-repository.ts
│   │   │   ├── prompt-repository.ts
│   │   │   ├── provider-repository.ts
│   │   │   └── token-usage-repository.ts
│   │   ├── conversation-migration-service.ts
│   │   ├── conversation-storage-service.ts
│   │   ├── json-collection.ts
│   │   ├── json-file.ts
│   │   └── jsonl-run-journal.ts
│   ├── rag/  # Chunker
│   │   ├── chunker.ts
│   │   └── incremental-indexer.ts
│   ├── document-grader.ts
│   ├── embedding-manager.ts
│   ├── rag-manager.ts
│   └── vector-store.ts
├── presentation/  # UI
│   ├── chat/
│   │   ├── hover-link.ts
│   │   └── rich-markdown.ts
│   ├── components/  # Chat components, settings tabs, modals
│   │   ├── chat/
│   │   │   ├── controllers/
│   │   │   │   ├── base-controller.ts
│   │   │   │   ├── chat-controller.ts
│   │   │   │   └── input-controller.ts
│   │   │   ├── handlers/
│   │   │   │   └── tool-call-handler.ts
│   │   │   ├── managers/
│   │   │   │   └── conversation-manager.ts
│   │   │   ├── utils/
│   │   │   │   └── provider-utils.ts
│   │   │   ├── chat-header.component.ts
│   │   │   ├── chat-input.component.ts
│   │   │   ├── chat-session-controller.ts
│   │   │   ├── conversation-list-view.ts
│   │   │   ├── message-renderer.ts
│   │   │   └── rag-status-panel.ts
│   │   ├── modals/
│   │   │   ├── agent-capability-modal.ts
│   │   │   ├── agent-edit-modal.ts
│   │   │   ├── agent-task-launch-modal.ts
│   │   │   ├── changelog-modal.ts
│   │   │   ├── confirm-modal.ts
│   │   │   ├── explain-text-modal.ts
│   │   │   ├── mcp-inspector-modal.ts
│   │   │   ├── mcp-server-modal.ts
│   │   │   ├── modal-export-target-picker.ts
│   │   │   ├── ollama-model-manager-modal.ts
│   │   │   ├── prompt-modal.ts
│   │   │   ├── provider-config-modal.ts
│   │   │   ├── searchable-image-modal.ts
│   │   │   ├── searchable-reference-modal.ts
│   │   │   ├── single-file-selection-modal.ts
│   │   │   ├── system-prompt-edit-modal.ts
│   │   │   └── text-input-modal.ts
│   │   ├── settings/
│   │   │   └── settings-form.ts
│   │   ├── tabs/
│   │   │   ├── tools/
│   │   │   │   ├── builtin-tools-section.ts
│   │   │   │   ├── cli-tools-section.ts
│   │   │   │   └── openapi-tools-section.ts
│   │   │   ├── agents-tab.ts
│   │   │   ├── general-tab.ts
│   │   │   ├── llm-tab.ts
│   │   │   ├── mcp-tab.ts
│   │   │   ├── models-tab.ts
│   │   │   ├── prompts-tab.ts
│   │   │   ├── provider-tab.ts
│   │   │   ├── quickactions-tab.ts
│   │   │   ├── rag-tab.ts
│   │   │   ├── tools-tab.ts
│   │   │   ├── usage-tab.ts
│   │   │   └── websearch-tab.ts
│   │   ├── provider-meta.ts
│   │   └── settings-tab.ts
│   ├── editor/
│   │   ├── ai-selection-extension.ts
│   │   └── editor-quick-actions.ts
│   ├── markdown/
│   │   └── ai-code-block.ts
│   ├── modals/
│   │   └── model-switcher-modal.ts
│   ├── state/  # Per-view state
│   │   └── chat-view-state.ts
│   ├── status/
│   │   └── agent-status-bar.ts
│   ├── suggest/
│   │   └── mention-suggest.ts
│   ├── utils/
│   │   ├── config-field-metadata.ts
│   │   ├── config-schema.ts
│   │   ├── test-ids.ts
│   │   └── ui-helpers.ts
│   ├── views/  # Chat view, workspace, agent task launcher
│   │   ├── agent-task-launcher.ts
│   │   ├── chat-view.ts
│   │   └── chat-workspace.ts
│   └── app-services.ts
├── types/  # Interfaces and data shapes
│   ├── common/
│   │   ├── attachments.ts
│   │   ├── index.ts
│   │   ├── llm.ts
│   │   ├── reasoning.ts
│   │   └── tools.ts
│   ├── core/
│   │   ├── agent.ts
│   │   ├── conversation.ts
│   │   ├── index.ts
│   │   └── model.ts
│   ├── features/
│   │   ├── agent-run.ts
│   │   ├── cli-tools.ts
│   │   ├── index.ts
│   │   ├── mcp.ts
│   │   ├── memory.ts
│   │   ├── openapi-tools.ts
│   │   ├── rag.ts
│   │   ├── usage.ts
│   │   └── web-search.ts
│   ├── augmentations.d.ts
│   ├── index.ts
│   └── settings.ts
├── utils/  # Small helpers
│   ├── errors.ts
│   ├── file-system.ts
│   └── type-guards.ts
└── constants.ts
```

## `packages/obsidian-llm/src/`

```
packages/obsidian-llm/src/
├── providers/
│   ├── anthropic-provider.ts
│   ├── deepseek-provider.ts
│   ├── google-provider.ts
│   ├── ollama-provider.ts
│   ├── openai-compatible-provider.ts
│   ├── openai-provider.ts
│   ├── openrouter-provider.ts
│   ├── sap-ai-core-provider.ts
│   └── sap-sse.ts
├── base-provider.ts
├── base-streaming-provider.ts
├── diagnostics.ts
├── http.ts
├── hub.ts
├── index.ts
├── model-manager.ts
├── obsidian-http.ts
├── openai-message.ts
├── provider-factory.ts
├── resilient-http.ts
└── types.ts
```
