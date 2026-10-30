# Performance

What was measured, which options were compared, and why the current choices won. Re-run the numbers with `npm run build:production -- --analyze` (bundle) and `tests/e2e/specs/perf/startup.spec.ts` (startup budget, 1 s).

## Startup

The plugin loads settings, registers views and commands in `onload`, and starts everything else (tool sources, MCP servers, RAG, the default agent) after layout is ready, in the background. Disabling and re-enabling the plugin inside Obsidian 1.14.5, seven runs each, production builds:

| Build | `main.js` | Enable → services ready (ms) |
|-------|-----------|------------------------------|
| Before the locale packs | 686 KB | 12, 10, 14, 33, 37, 22, 16 |
| With all 49 locales packed | 1.14 MB | 16, 12, 10, 8, 7, 8, 7 |

The difference is within run-to-run noise; both are two orders of magnitude under the budget.

## Bundle

Production bundle, largest contributors:

| Part | Size |
|------|------|
| Locale packs (48 languages) | 541 KB |
| `src/ui` | 240 KB |
| `src/features` | 129 KB |
| i18next | 44 KB |
| `src/adapters` | 42 KB |
| marked | 41 KB |
| `packages/obsidian-llm` | 39 KB |
| zod (`zod/mini`) | 26 KB |

### Decisions

| Area | Options measured | Chosen | Why |
|------|------------------|--------|-----|
| Tool schemas | `zod` classic 454 KB · `zod/mini` 24 KB | `zod/mini` | Same validation; the production bundle went from 1.28 MB to 697 KB. Each file imports `zod/mini` directly; re-exporting the namespace from a wrapper module defeats tree-shaking and pulls in every zod locale. |
| MCP client | `@modelcontextprotocol/sdk` (with its zod and ajv) · in-house stdio JSON-RPC session | In-house (`adapters/process/mcp-stdio-session.ts`) | The plugin needs only `initialize`, `tools/list` (paged) and `tools/call` over stdio. The SDK brought its own full zod, ajv and 55 transitive packages. |
| Package entry points | esbuild default `main` · `mainFields: ['module', 'main']` | `module` first | ES module builds tree-shake; CommonJS builds do not. |
| Languages | Separate `locales/*.json` (686 KB) · all locales inlined as JSON (≈3.2 MB) · fetch from GitHub on first use · one Brotli blob for all locales (≈560 KB, decode all ≈10 ms) · one Brotli pack per locale (541 KB, decode one ≈0.5 ms) | Per-locale Brotli packs | Obsidian installs only `main.js`, `styles.css` and `manifest.json`, so separate files never reached users. Fetching adds a network dependency and fails offline. Per-locale packs keep values only, in English key order, and decode just the active language. |
| Markdown in chat | marked (41 KB, synchronous) · Obsidian `MarkdownRenderer` (no bundle cost, asynchronous, renders embeds and plugins' post-processors) | marked | Streaming appends plain text and renders markdown once at the end, so render speed is not the bottleneck. marked is kept because it renders a long history synchronously, without layout shifts, and does not run other plugins' post-processors on model output. Switching saves 41 KB if that trade-off changes. |
| Translation runtime | i18next (44 KB) · a hand-written `t()` | i18next | Plural forms for 49 languages and interpolation are already correct and tested; a rewrite would save 44 KB at the risk of plural bugs in languages nobody on the project reads. |

## Runtime

- RAG skips notes whose content hash and embedding model are unchanged, re-keys chunks on rename instead of re-embedding, and swaps a note's chunks in once after embedding so searches never see a half-indexed note.
- Model lists are cached per provider config, and concurrent requests for the same list share one request.
- The agent efficiency baseline (`tests/perf/efficiency.baseline.json`) fixes the number of turns and tool calls per scenario; `npm run test:perf` fails if a change makes the agent take more.
- `npm run test:perf:mem` checks heap growth under forced GC across repeated agent runs.
