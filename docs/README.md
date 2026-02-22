# Intelligence Assistant — Documentation

This folder contains all documentation for the Intelligence Assistant Obsidian plugin.

## Contents

| Path | Description |
|------|-------------|
| [architecture/overview-en.md](architecture/overview-en.md) | Architecture overview (English) |
| [architecture/overview-zh.md](architecture/overview-zh.md) | 架构总览（中文） |
| [reference/project-structure.md](reference/project-structure.md) | Full annotated source tree |
| [reference/api.md](reference/api.md) | Internal API reference (core layer) |

## Quick orientation

- **Main README**: [../README.md](../README.md) — user-facing feature docs and quick start
- **Source**: `../src/` — all TypeScript source under six top-level namespaces: `core`, `domain`, `application`, `infrastructure`, `presentation`, `types`
- **Entry point**: `../main.ts` — Obsidian plugin bootstrap
- **Styles**: `../styles.css` — all CSS (auto-loaded by Obsidian)

## Adding new docs

Place new documents in the most appropriate subfolder and add a link to the table above so they can be discovered.
