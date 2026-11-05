# Performance and measurement scope

## Current 0.1.0 artifact (2026-11-05)

The production artifact built for the version revision has these exact sizes and hashes. These are local build measurements, not a fresh startup/heap benchmark:

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `main.js` | 1,436,982 | `3a74db09c18025ee3eac583b47d571b8d9969c4ff9423554b10888a7ee1b13c5` |
| `styles.css` | 86,926 | `0b3719add242b28abd78e65cafc844904069c2008db85bd3e06e3bfa6132568a` |
| `manifest.json` | 340 | `90644f0f134ba6cce64b0578379d6cee21f5e99ca3caf513ba161569d66f43ed` |

The 0.1.0 version-only revision retained the same main.js/styles.css bytes as the complete real-gated 0.0.23 runtime. The manifest/version metadata changed. See [release scope](../releases/0.1.0.md) for actual test provenance.

The recorded real task ran for 40.525 minutes and produced 100 independently checked articles with 132,739 words. It used a configured Agent profile and a real file-measurement CLI. It is not a latency, concurrency or all-model benchmark; startup measurements below belong to earlier optimization work.

## Reproducing measurements

- `npm run build:production -- --analyze`: production bundle analysis.
- `tests/e2e/specs/perf/startup.spec.ts`: inspect the host/performance test's configuration before running it.
- `npm run test:perf` and `npm run test:perf:mem`: deterministic/mock performance controls; do not run them during a no-mock task.
- `npm run verify:release:real`: actual configured service/workload acceptance, with artifact identity and real journal duration.

Do not compare sizes, timing or heap figures without the commit, build mode, host, configuration and workload. The older figures below are preserved as historical engineering notes; their component totals and timings must not be advertised as freshly measured 0.1.0 results.

---

# Historical optimization notes

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
| Locale packs (48 languages, every plural form) | 605 KB |
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
| Languages | Separate `locales/*.json` (686 KB) · all locales inlined as JSON (≈3.2 MB) · fetch from GitHub on first use · one Brotli blob for all locales (≈560 KB, decode all ≈10 ms) · one Brotli pack per locale (541 KB, decode one ≈0.5 ms) | Per-locale Brotli packs | Obsidian installs only `main.js`, `styles.css` and `manifest.json`, so separate files never reached users. Fetching adds a network dependency and fails offline. Per-locale packs keep values in English key order plus the plural forms English lacks (`_few`, `_many`, …), and decode just the active language. With every language's plural forms, the built-in tool labels and the first-run guide, the production `main.js` is 1.28 MB. |
| Markdown in chat | marked (41 KB, synchronous) · Obsidian `MarkdownRenderer` (no bundle cost, asynchronous, renders embeds and plugins' post-processors) | marked | Streaming appends plain text and renders markdown once at the end, so render speed is not the bottleneck. marked is kept because it renders a long history synchronously, without layout shifts, and does not run other plugins' post-processors on model output. Switching saves 41 KB if that trade-off changes. |
| Translation runtime | i18next (44 KB) · a hand-written `t()` | i18next | Plural forms for 49 languages and interpolation are already correct and tested; a rewrite would save 44 KB at the risk of plural bugs in languages nobody on the project reads. |

## Runtime

- RAG skips notes whose content hash and embedding model are unchanged, re-keys chunks on rename instead of re-embedding, and swaps a note's chunks in once after embedding so searches never see a half-indexed note.
- Model lists are cached per provider config, and concurrent requests for the same list share one request.
- The agent efficiency baseline (`tests/perf/efficiency.baseline.json`) fixes the number of turns and tool calls per scenario; `npm run test:perf` fails if a change makes the agent take more.
- `npm run test:perf:mem` checks heap growth under forced GC across repeated agent runs.
