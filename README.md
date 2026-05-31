# Intelligence Assistant for Obsidian

Turn your vault into an **Obsidian-Native Agentic Workspace**. Intelligence Assistant is an autonomous AI agent that deeply understands your vault's structure, links, and canvas. It can independently plan and execute complex knowledge tasks—from organizing folders to building mind maps—all while ensuring safety through a **Proposal-First** execution model.

> Desktop only. Requires Obsidian v1.7.2+.

## 🚀 The Agentic Evolution

This plugin has evolved beyond a simple chat interface into a full **SPAR (Sense-Plan-Act-Reflect)** autonomous loop:

- **📡 Sense**: The Agent perceives your active note, graph neighbors, directory structure, RAG snippets, and its own long-term memories.
- **🧠 Plan**: Using advanced reasoning (Chain-of-Thought), the Agent formulates a multi-step strategy and provides a transparent **Task Checklist**.
- **🛠️ Act**: It independently executes tools (Vault, Canvas, MCP, Web, CLI) to gather information or prepare modifications.
- **🔄 Reflect**: It evaluates results and refines its approach. Any vault changes are presented as **Batch Write Proposals** for your one-click approval.

## ✨ Feature Highlights

- **Built-in Expert Team** — Get started instantly with pre-configured personas: **Librarian** (Organization), **Architect** (Canvas & Mapping), **Researcher** (Synthesis), and **Scribe** (Writing & Vision).
- **Spatial & Visual Intelligence** — Independent read/write access to **Obsidian Canvas** (.canvas) files. Use Multi-modal Vision to turn sketches or screenshots into notes.
- **Cognitive Memory System** — Long-term associative memory via a local vector store. The Agent remembers your preferences and key research findings across conversations.
- **Modern Logical UI** — A redesigned **Execution Timeline** that merges reasoning and actions into a single flow. Compact tool pills save space while remaining fully inspectable.
- **Vault-Native Tools** — Specialized tools for **Properties (YAML)** management, batch file operations (move, create, delete), and directory-tree awareness.
- **Multiple LLM Providers** — OpenAI, Anthropic (Claude 3.5), Google Gemini, DeepSeek, Ollama (local), OpenRouter, and SAP AI Core.
- **MCP & OpenAPI Integration** — Seamlessly connect Model Context Protocol servers or any OpenAPI-spec service to expand your Agent's toolset.
- **Privacy First** — Your notes stay local. Indexing (RAG) uses a local vector store with configurable embedding providers.

## 🚀 Quick Start

### 📦 Community Plugin (recommended)

1. Open **Settings → Community plugins** in Obsidian.
2. Browse for **"Intelligence Assistant"** and install.
3. Enable the plugin, then open **Settings → Intelligence Assistant** to configure providers.

### 📋 Requirements

| Requirement | Details |
|---|---|
| Obsidian | v1.7.2 or later (desktop only) |
| LLM API key | OpenAI, Anthropic, Google, DeepSeek, etc. |

## 🤖 Agents

Defined under **Settings → Agents**. Each agent has:

- System prompt, tool permissions, MCP server access
- Model strategy: `default`, `chat-view` (follow chat selector), or `fixed`
- Capabilities: RAG, Web Search, Long-term Memory
- Custom icon and display name

Agent mode uses **native function calling** (OpenAI) with automatic fallback to text-based tool parsing for other providers.

## 🧭 Agentic Scenarios

Command Palette (`Cmd+P`) and context menus expose task-oriented Agent entry points:

- **Folder Organizer** — proposes folder cleanup, moves, and index/MOC candidates.
- **Project Brief** — summarizes project status and next actions from a note or folder.
- **Weekly Review** — scans daily/project context to draft accomplishments and next-week plans.
- **Research Brief** — turns notes into a sourced research summary with a reading queue.
- **Link/Tag Doctor** — diagnoses inconsistent tags and orphaned concepts.
- **Writing Scribe** — creates drafts from source material and understands image sketches.

## 🔌 Tooling & Integration

### 📁 Vault Mastery
- **Batch Proposals**: Confirm multiple file moves or edits in a single click.
- **Property Doctor**: Automatically standardize tags, dates, and custom fields.

### 🎨 Canvas Support
- Independent access to `.canvas` JSON. The Agent can place cards, link files, and organize your visual workspace.

### 🌐 Beyond the Vault
- **Web Search**: 8 supported providers for real-time external grounding.
- **MCP & OpenAPI**: Connect external data sources and automation scripts.

## 🌐 Internationalization

Supports all 46 Obsidian languages, including full localization for the **Command Palette** and **Context Menus**.

[中文文档](README-zh.md) | [English](README.md)

## 🛠️ Development

```bash
npm install          # install dependencies
npm run dev          # development build + file watcher
npm run lint         # ESLint check
npm run test         # Jest test suite
npm run build        # production bundle
```

## 📖 Documentation

| Document | Description |
|---|---|
| [README-zh.md](README-zh.md) | Chinese README (中文说明) |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/architecture/overview-en.md](docs/architecture/overview-en.md) | Architecture overview |
| [docs/project/project-guide-en.md](docs/project/project-guide-en.md) | Developer project guide |
| [docs/reference/project-structure.md](docs/reference/project-structure.md) | Full source tree reference |

Contributions, issues, and feature requests are welcome — open a PR or discussion.
