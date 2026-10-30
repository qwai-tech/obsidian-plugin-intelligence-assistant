# Project Structure

The source tree after the feature-folder refactor. Folder roles and import rules are in the [architecture overview](../architecture/overview-en.md). Tests (`__tests__/`), locale files and CSS are omitted.

## Root

```
obsidian-plugin-intelligence-assistant/
├── main.ts                  # Obsidian Plugin: settings, views, commands; calls src/bootstrap
├── manifest.json · package.json · tsconfig.json · tsconfig.test.json · jest.config.js · eslint.config.mts
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
├── adapters/  # Adapters behind feature ports
│   ├── i18n/  # Brotli locale packs built into main.js; decodes the active language
│   │   └── packed-locales.ts
│   ├── obsidian/  # Obsidian file-system and secret storage adapters
│   │   ├── obsidian-file-system.ts
│   │   └── obsidian-secret-vault.ts
│   ├── persistence/  # Atomic JSON files, JSONL run journal, conversations
│   │   ├── data/  # Caches, token usage and agent memory
│   │   │   ├── agent-memory-repository.ts
│   │   │   ├── mcp-tool-cache-repository.ts
│   │   │   ├── model-cache-repository.ts
│   │   │   └── token-usage-repository.ts
│   │   ├── conversation-migration-service.ts
│   │   ├── conversation-records.ts
│   │   ├── conversation-storage-service.ts
│   │   ├── json-collection.ts
│   │   ├── json-file.ts
│   │   ├── jsonl-run-journal.ts
│   │   └── legacy-settings-files.ts  # Reads the pre-data.json settings layout once
│   ├── process/  # Everything that starts a process
│   │   ├── command-runner.ts  # CommandRunner port for CLI tools
│   │   ├── mcp-stdio-connector.ts  # McpConnector port
│   │   ├── mcp-stdio-session.ts  # MCP JSON-RPC over a server's stdio
│   │   └── resolve-command.ts  # Finds npx, uvx, python… without a shell
│   └── rag/  # RAG manager, vector store, similarity, chunker, embeddings
│       ├── chunker.ts
│       ├── document-grader.ts
│       ├── embedding-manager.ts
│       ├── incremental-indexer.ts
│       ├── rag-manager.ts
│       ├── rag-types.ts
│       ├── similarity.ts
│       └── vector-store.ts
├── bootstrap/  # Composition root: builds and wires services
│   ├── agent-entry-points.ts
│   ├── create-services.ts
│   ├── obsidian-settings-persistence.ts
│   ├── plugin-data-service.ts
│   ├── plugin-integrations.ts
│   └── tool-source-factory.ts
├── capabilities/  # Obsidian API capability manifest
│   └── capability-manifest.ts
├── core/  # Plugin paths, interfaces, constants, utils
│   ├── interfaces/
│   │   └── file-system.interface.ts
│   ├── utils/
│   │   ├── errors.ts
│   │   ├── file-system.ts
│   │   ├── note-writer.ts  # Atomic note writes through the editor or Vault.process
│   │   └── type-guards.ts
│   ├── augmentations.d.ts
│   ├── constants.ts
│   ├── plugin-paths.ts
│   └── rag-index-filter.ts  # Which notes RAG may index
├── features/  # Use cases, ports and types; one index.ts per feature
│   ├── agent/  # Agent engine, sensing, memory, tool access
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
│   │   ├── types/
│   │   │   ├── agent-run.ts
│   │   │   ├── agent.ts
│   │   │   └── memory.ts
│   │   ├── agent-capability-summary.ts
│   │   ├── agent-engine-loop.ts
│   │   ├── agent-memory-service.ts
│   │   ├── agent-sense-service.ts
│   │   ├── agent-service.ts
│   │   ├── agent-task-text.ts
│   │   ├── history-compactor.ts
│   │   ├── index.ts
│   │   ├── obsidian-agent-prompts.ts
│   │   ├── obsidian-context-builder.ts
│   │   ├── run-activity.ts
│   │   ├── tool-access-editor.ts
│   │   ├── types.ts
│   │   └── write-proposal-service.ts
│   ├── chat/  # Chat service, session policy, titles, export
│   │   ├── types/
│   │   │   └── attachments.ts
│   │   ├── chat-session-policy.ts
│   │   ├── chat.service.ts
│   │   ├── conversation-namer.ts
│   │   ├── index.ts
│   │   └── vault-export-service.ts
│   ├── conversations/  # Conversation types
│   │   ├── types/
│   │   │   └── conversation.ts
│   │   └── index.ts
│   ├── knowledge/  # KnowledgeBase and MemoryIndex ports, RAG types
│   │   ├── types/
│   │   │   └── rag.ts
│   │   ├── index.ts
│   │   └── knowledge-base.ts
│   ├── llm/  # LLM hub, Ollama admin, LLM and model types
│   │   ├── types/
│   │   │   ├── llm.ts
│   │   │   ├── model.ts
│   │   │   └── reasoning.ts
│   │   ├── index.ts
│   │   ├── llm-hub-service.ts
│   │   └── ollama-admin.ts
│   ├── settings/  # Settings store, data.json document, secrets, migrations
│   │   ├── types/
│   │   │   └── settings.ts
│   │   ├── index.ts
│   │   ├── settings-codec.ts
│   │   ├── settings-document.ts
│   │   ├── settings-migrations.ts
│   │   ├── settings-reload.ts
│   │   ├── settings-secrets.ts
│   │   └── settings-store.ts
│   ├── tools/  # Tool registry, sources, built-in tools, presets
│   │   ├── cli-presets/  # CLI tool presets by category
│   │   │   ├── code.ts
│   │   │   ├── data.ts
│   │   │   ├── files.ts
│   │   │   ├── macos-apps.ts
│   │   │   ├── network.ts
│   │   │   ├── search.ts
│   │   │   └── system.ts
│   │   ├── sources/  # Built-in, CLI, MCP and OpenAPI tool sources
│   │   │   ├── builtin-tool-source.ts
│   │   │   ├── cli-tool-source.ts
│   │   │   ├── mcp-tool-source.ts
│   │   │   ├── openapi-loader-core.ts
│   │   │   ├── openapi-operation-tool.ts
│   │   │   ├── openapi-spec-loader.ts
│   │   │   └── openapi-tool-source.ts
│   │   ├── types/
│   │   │   ├── cli-tools.ts
│   │   │   ├── mcp.ts
│   │   │   ├── openapi-tools.ts
│   │   │   └── tools.ts
│   │   ├── canvas-tools.ts
│   │   ├── cli-tool-presets.ts
│   │   ├── cli-tool.ts
│   │   ├── file-tools.ts
│   │   ├── index.ts
│   │   ├── link-tools.ts
│   │   ├── mcp-client.ts
│   │   ├── mcp-helpers.ts
│   │   ├── mcp-tool-wrapper.ts
│   │   ├── pdf-tools.ts
│   │   ├── process-ports.ts  # McpConnector and CommandRunner ports
│   │   ├── search-tools.ts
│   │   ├── subprocess-env.ts
│   │   ├── tag-tools.ts
│   │   ├── tool-migrations.ts
│   │   ├── tool-registry.ts
│   │   ├── tool-schema.ts
│   │   ├── vault-path.ts
│   │   ├── tool-source-manager.ts
│   │   └── tool-source.ts
│   ├── usage/  # Token usage types
│   │   ├── types/
│   │   │   └── usage.ts
│   │   └── index.ts
│   └── web-search/  # Search service and query heuristics
│       ├── backends/  # One file per search backend
│       │   ├── backend.ts
│       │   ├── bing.ts
│       │   ├── brave.ts
│       │   ├── google.ts
│       │   ├── mojeek.ts
│       │   ├── qwant.ts
│       │   ├── searxng.ts
│       │   ├── serpapi.ts
│       │   └── tavily.ts
│       ├── types/
│       │   └── web-search.ts
│       ├── backends.ts
│       ├── index.ts
│       ├── query-heuristics.ts
│       └── web-search-service.ts
├── i18n/  # Translations
│   └── index.ts
└── ui/  # User interface
    ├── chat/  # Chat components, controllers, session controller
    │   ├── controllers/
    │   │   ├── base-controller.ts
    │   │   ├── chat-controller.ts
    │   │   └── chat-reply.ts
    │   ├── handlers/
    │   │   └── tool-call-handler.ts
    │   ├── managers/
    │   │   └── conversation-manager.ts
    │   ├── utils/
    │   │   └── provider-utils.ts
    │   ├── agent-trace-recorder.ts
    │   ├── agent-trace-view.ts
    │   ├── chat-header.component.ts
    │   ├── chat-input.component.ts
    │   ├── chat-message-list.ts
    │   ├── chat-pickers.ts
    │   ├── chat-session-controller.ts
    │   ├── conversation-list-view.ts
    │   ├── conversation-settings.ts
    │   ├── hover-link.ts
    │   ├── message-footer.ts
    │   ├── message-grouping.ts
    │   ├── message-renderer.ts
    │   ├── rag-status-panel.ts
    │   ├── rich-markdown.ts
    │   └── write-proposal-cards.ts
    ├── editor/
    │   ├── ai-selection-extension.ts
    │   └── editor-quick-actions.ts
    ├── markdown/
    │   └── ai-code-block.ts
    ├── modals/  # Dialogs
    │   ├── agent-capability-modal.ts
    │   ├── agent-edit-modal.ts
    │   ├── agent-model-options.ts
    │   ├── agent-task-launch-modal.ts
    │   ├── agent-tool-access-section.ts
    │   ├── changelog-modal.ts
    │   ├── cli-tool-config-modal.ts
    │   ├── cli-tool-preset-modal.ts
    │   ├── confirm-modal.ts
    │   ├── explain-text-modal.ts
    │   ├── mcp-inspector-data.ts
    │   ├── mcp-inspector-modal.ts
    │   ├── mcp-server-modal.ts
    │   ├── mcp-tool-arguments.ts
    │   ├── mcp-tool-tester.ts
    │   ├── modal-export-target-picker.ts
    │   ├── model-switcher-modal.ts
    │   ├── ollama-model-manager-modal.ts
    │   ├── prompt-modal.ts
    │   ├── provider-config-modal.ts
    │   ├── searchable-image-modal.ts
    │   ├── searchable-reference-modal.ts
    │   ├── single-file-selection-modal.ts
    │   ├── system-prompt-edit-modal.ts
    │   └── text-input-modal.ts
    ├── settings/  # Declarative settings tab, section pages, form kit
    │   ├── tabs/
    │   │   ├── tools/
    │   │   │   ├── builtin-tools-section.ts
    │   │   │   ├── cli-tools-section.ts
    │   │   │   └── openapi-tools-section.ts
    │   │   ├── agents-tab.ts
    │   │   ├── general-tab.ts
    │   │   ├── llm-tab.ts
    │   │   ├── mcp-actions.ts
    │   │   ├── mcp-tab.ts
    │   │   ├── models-tab.ts
    │   │   ├── prompts-tab.ts
    │   │   ├── provider-tab.ts
    │   │   ├── quickactions-tab.ts
    │   │   ├── rag-index-panel.ts
    │   │   ├── rag-tab.ts
    │   │   ├── tools-tab.ts
    │   │   ├── usage-tab.ts
    │   │   └── websearch-tab.ts
    │   ├── section-page.ts
    │   ├── settings-form.ts
    │   ├── settings-tab.ts
    │   └── sub-tabs.ts
    ├── state/  # Per-view state
    │   └── chat-view-state.ts
    ├── status/
    │   └── agent-status-bar.ts
    ├── suggest/
    │   └── mention-suggest.ts
    ├── utils/
    │   ├── config-field-metadata.ts
    │   ├── icon.ts
    │   ├── test-ids.ts
    │   └── ui-helpers.ts
    ├── views/  # Chat view, workspace, agent task launcher
    │   ├── agent-task-launcher.ts
    │   ├── chat-view.ts
    │   └── chat-workspace.ts
    ├── app-services.ts
    ├── plugin-host.ts  # What UI code may use from the plugin
    └── provider-meta.ts
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
│   └── openrouter-provider.ts
├── base-provider.ts
├── base-streaming-provider.ts
├── diagnostics.ts
├── http.ts
├── hub.ts
├── index.ts
├── model-catalog.ts
├── model-fetchers.ts
├── model-manager.ts
├── obsidian-http.ts
├── openai-message.ts
├── provider-factory.ts
├── resilient-http.ts
└── types.ts
```
