# Intelligence Assistant documentation

Current source version: **0.1.0**. Published assets, source preparation and test evidence have separate version scopes; start with the [status record](releases/0.1.0.md).

## Current guides

| Document | Contents |
|---|---|
| [English README](../README.md) / [中文 README](../README-zh.md) | Features, installation and first setup |
| [User guide](user-guide-en.md) / [使用指南](user-guide-zh.md) | Settings Tabs, models, tools, writes, continuation, data and troubleshooting |
| [Architecture](architecture/overview-en.md) / [架构](architecture/overview-zh.md) | Runtime ownership, lifecycle, execution and persistence |
| [Execution contracts](architecture/execution-contracts.md) | Detailed engineering contracts and bounded guarantees |
| [Developer guide](project/project-guide-en.md) / [开发指南](project/project-guide-zh.md) | Builds, local deployment, storage and extension points |
| [Source map](reference/project-structure.md) | Directory ownership and selected entry points |
| [Testing](reference/testing.md) | Real versus mock routes, frozen-bundle gates and CI |
| [Performance](reference/performance.md) | Separately scoped current artifact measurements and historical notes |
| [0.1.0 status](releases/0.1.0.md) | Changes, actual validation scope, exclusions and publication state |

## Decisions and preparation records

- [ADR-001](architecture/adr-001-safety-and-engine-usage.md): tool execution / turn-kernel boundary.
- [ADR-002](architecture/adr-002-agent-budget-and-trace.md): host allowance, model estimates and truthful traces.
- [ADR-003](architecture/adr-003-autonomous-write.md): explicit automatic application of vault proposals.
- [0.0.23 preparation](releases/0.0.23-preparation.md) and [0.1.0 preparation](releases/0.1.0-preparation.md): scoped records of source/release preparation, not announcements of a published release.

## Historical and draft material

`superpowers/` holds dated design plans/reports. `architecture/trinity-design*.md` describes an earlier design proposal. These records can mention paths, tools and behavior that were later changed; use the current guides/source for implementation contracts.

`promotion/` and `promotional/` contain [draft launch material](promotional/README.md), including older screenshots/mockups. They are not current release evidence or ready-to-publish claims. Verify them against the current README and version record before use.

## Source orientation

`main.ts` and `src/bootstrap/` compose the plugin. Runtime code is owned by `src/features/`, `src/adapters/`, `src/ui/` and `src/core/`, with `src/i18n/` and `src/capabilities/` for translation/API metadata. The LLM protocols live in `packages/obsidian-llm`. Tests and test support are separate; see the [source map](reference/project-structure.md).

Generated local reports under `test-results/` are ignored and cannot be opened by another reader through your localhost address. Committed validation summaries record scope and artifact identity; share redacted raw evidence separately or reproduce the documented real gate.
