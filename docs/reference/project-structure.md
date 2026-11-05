# Source map — 0.1.0

This is an ownership map with selected entry points, not a frozen list of every file. Use `rg --files src packages tests` for the actual inventory.

## Root and runtime

| Path | Responsibility / starting point |
|---|---|
| [`main.ts`](../../main.ts) | Obsidian plugin lifecycle and host registration |
| [`manifest.json`](../../manifest.json) | Plugin identity, source version, minimum Obsidian version |
| [`styles.css`](../../styles.css) | Plugin UI styles |
| [`src/bootstrap/create-services.ts`](../../src/bootstrap/create-services.ts) | Composition and owned-service disposal |
| [`src/bootstrap/obsidian-settings-persistence.ts`](../../src/bootstrap/obsidian-settings-persistence.ts) | Current settings document and legacy migration wiring |
| [`src/bootstrap/plugin-integrations.ts`](../../src/bootstrap/plugin-integrations.ts) | Vault events, AI blocks and deep links |
| [`src/core/plugin-paths.ts`](../../src/core/plugin-paths.ts) | Paths under the real vault configuration directory |
| [`src/core/notifications.ts`](../../src/core/notifications.ts) | Central notification delivery |

## Features

| Directory | Key modules |
|---|---|
| [`src/features/agent/`](../../src/features/agent) | `agent-engine-loop.ts`, `task-checkpoint.ts`, `execution-policy.ts`, `write-proposal-service.ts`; `kernel/` contains budgets, completion/count guards, argument evidence and model/tool/context ports |
| [`src/features/chat/`](../../src/features/chat) | `chat.service.ts`, model/session policy, conversation naming and reply export |
| [`src/features/settings/`](../../src/features/settings) | Store, codec, document validation, migrations, secrets and feature-owned settings types |
| [`src/features/tools/`](../../src/features/tools) | Registry, source manager, schema/effects, built-ins, CLI presets; `sources/` supplies built-in/CLI/MCP/OpenAPI sources |
| [`src/features/knowledge/`](../../src/features/knowledge) | Knowledge/memory ports and RAG configuration |
| [`src/features/llm/`](../../src/features/llm) | Plugin-facing LLM Hub and Ollama administration |
| [`src/features/web-search/`](../../src/features/web-search) | Query heuristics, backend dispatch and eight backend adapters |
| [`src/features/conversations/`](../../src/features/conversations) / [`usage/`](../../src/features/usage) | Conversation and usage types/contracts |

Feature types live with their feature. Consumers use explicit barrel exports; consult [`eslint.config.mts`](../../eslint.config.mts) for actual layer rules.

## Adapters and UI

| Path | Responsibility |
|---|---|
| [`src/adapters/persistence/`](../../src/adapters/persistence) | Settings legacy files, conversation JSON, JSONL journals and JSON-backed caches/usage/memory |
| [`src/adapters/rag/`](../../src/adapters/rag) | RAG manager, chunking, embeddings, vector storage, grading and incremental indexing |
| [`src/adapters/process/`](../../src/adapters/process) | Process cancellation, command resolution and MCP stdio JSON-RPC |
| [`src/adapters/obsidian/`](../../src/adapters/obsidian) | Host filesystem and SecretStorage adapters |
| [`src/ui/views/`](../../src/ui/views) | Chat view/workspace and task launcher |
| [`src/ui/chat/`](../../src/ui/chat) | Request/session controllers, rendering, trace, composer and conversation list |
| [`src/ui/settings/`](../../src/ui/settings) | Nine top-level Tabs, subtabs and form controls |
| [`src/ui/modals/`](../../src/ui/modals) | Agent/provider/tool editors, pickers and previews |
| [`src/ui/editor/`](../../src/ui/editor) / [`markdown/`](../../src/ui/markdown) | Editor actions and explicitly run AI blocks |
| [`src/i18n/`](../../src/i18n) | Translation runtime, aliases and 49 locale JSON files |
| [`src/capabilities/`](../../src/capabilities) | Obsidian API capability manifest |

## LLM package

[`packages/obsidian-llm/src/`](../../packages/obsidian-llm/src) contains the provider registry/factory/facade, model manager/identity, request budgeting, HTTP/Obsidian transports, completion status and SSE handling. `providers/` implements OpenAI-compatible, Anthropic, Google, Ollama and SAP-specific protocols.

The host build resolves `@qwai/obsidian-llm` from this workspace through the TypeScript/build aliases. Consult the [package README](../../packages/obsidian-llm/README.md) for client/Hub contracts.

## Build and tests

- [`scripts/build.js`](../../scripts/build.js): development/production bundles and provenance.
- [`scripts/version.js`](../../scripts/version.js): synchronized plugin version metadata.
- [`scripts/run-real-release.mjs`](../../scripts/run-real-release.mjs) / [`verify-real-release.mjs`](../../scripts/verify-real-release.mjs): frozen-bundle real gate and evidence verification.
- `src/**/__tests__/`, `packages/obsidian-llm/src/__tests__/`: Jest unit tests.
- [`tests/e2e/`](../../tests/e2e): actual Obsidian host tests with separate real and mock configurations.
- [`tests/real/`](../../tests/real): real filesystem/process/network checks and captured-evidence audits.
- [`tests/harness/`](../../tests/harness), [`tests/missions/`](../../tests/missions), [`tests/perf/`](../../tests/perf): deterministic/mock test infrastructure and performance checks.
- [`tests/mutation/`](../../tests/mutation): mutation-test notes.

Generated reports, runtime vault data, production bundles and provenance are generally ignored. They are not release assets merely because they exist locally. See [testing](testing.md) and [release status](../releases/0.1.0.md).
