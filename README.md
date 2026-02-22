# Intelligence Assistant for Obsidian

Transform your vault into an AI-native workspace. Intelligence Assistant brings a fast chat interface, configurable agents, CLI agent SDKs, MCP tool integrations, RAG over your notes, web search, and HTTP/OpenAPI tools — all without leaving Obsidian.

> Desktop only. Requires Obsidian v0.15.0+.

## Feature Highlights

- **Modern Chat View** — Streaming chat with provider/model badges, token usage display, tool-call visualization, and an Agent mode that runs multi-step agentic loops.
- **Multiple LLM Providers** — OpenAI, Anthropic, Google Gemini, DeepSeek, Ollama (local), OpenRouter, and SAP AI Core. Add your own credentials per provider.
- **Configurable Agents** — Define reusable agents with custom prompts, tool permissions, memory settings, and MCP server access.
- **CLI Agent SDK Bridge** — Run Claude Code, Codex, and Qwen Code as full SDK-backed agents. Each CLI tool loads its own project config (`CLAUDE.md`, `AGENTS.md`, `QWEN.md`) natively; the plugin only configures what the tools can't handle themselves.
- **MCP Integration** — Connect any Model Context Protocol server. Tool catalogs are cached for instant reuse. Includes a built-in MCP inspector for live testing.
- **RAG** — Index your vault with a local vector store and inject relevant notes as context on every query.
- **Web Search** — DuckDuckGo, Google CSE, Bing, Tavily, Brave, SerpAPI, SearXNG, Qwant, Mojeek, Yahoo, and Yandex. Configurable locale, freshness, and allow/deny lists.
- **HTTP / OpenAPI Tools** — Point the plugin at any OpenAPI spec (local or remote); every path/verb pair becomes an agent tool automatically.
- **Quick Actions** — Pre-configured shortcut buttons for common tasks (summarize, explain, translate, etc.).
- **Context Attachments** — Attach files, images, or vault references (`@mentions`) to any message.

## Quick Start

### Community Plugin (recommended)

1. Open **Settings → Community plugins** in Obsidian.
2. Browse for **"Intelligence Assistant"** and install.
3. Enable the plugin, then open **Settings → Intelligence Assistant** to configure providers.

### Manual Install

1. Download the latest release.
2. Extract into `<vault>/.obsidian/plugins/intelligence-assistant/`.
3. Reload Obsidian and enable the plugin.

### Requirements

| Requirement | Details |
|---|---|
| Obsidian | v0.15.0 or later (desktop only) |
| Node.js | 18+ with npm (for building from source or CLI agent SDK install) |
| LLM API key | Per provider (OpenAI, Anthropic, Google, etc.) |
| CLI tools (optional) | `claude`, `codex`, or `qwen-code` on your PATH for CLI agent mode |

## Chat Experience

1. Open the chat via the ribbon icon or **Command Palette → Open Intelligence Assistant**.
2. Choose **Chat** or **Agent** mode in the toolbar. Agent mode runs the model in a loop with tool calls.
3. Pick a provider, model, temperature, and token cap from the header controls.
4. Toggle **RAG** (vault context) or **Web search** in the input bar.
5. Attach files or vault references with `@filename`.
6. Every response shows the provider, model, and token usage. Use **Insert to Notes** to drop a reply into the active file.

## Agents

### Regular Agents

Defined under **Settings → Agents**. Each agent has:
- System prompt, tool permissions, memory behavior
- MCP server access (optionally scoped)
- Custom icon and display name

### CLI Agents

Defined under **Settings → CLI Agents**. Each CLI agent uses an SDK bridge to run Claude Code, Codex, or Qwen Code as a subprocess. Configuration follows a **thin-bridge** approach:

| Plugin configures | Tool configures natively |
|---|---|
| Provider, model, permission mode | System prompt (`CLAUDE.md`, `AGENTS.md`, `QWEN.md`) |
| Working directory, max turns | Allowed/disallowed tools (`.claude/settings.json`, etc.) |
| API key override | MCP servers (native config files) |
| Budget cap (Claude) | Sandbox, network, reasoning settings |

Enable **Use project settings** (default on) to let each CLI tool load its own project config files automatically.

SDKs are installed on-demand via the **Install SDK** button in the detection panel.

## MCP Tools

Connect MCP servers under **Settings → MCP**. The plugin:
- Connects at startup and caches the tool manifest
- Injects MCP tools into agent loops automatically
- Provides a live **MCP Inspector** for testing tools interactively
- Supports stdio and SSE transports

## Web Search

Configure under **Settings → Web Search**. Pick one of 11 supported providers and set locale (language + region), result freshness, and domain filters. Credentials are stored per vault.

## HTTP / OpenAPI Tools

Add OpenAPI specs under **Settings → Tools → HTTP / OpenAPI**. For each source:
- Point at a local `.json`/`.yaml` file or a remote URL (cached locally)
- Override the base server URL and inject auth headers or query params
- Enable/disable the source; reload tool definitions on demand

Every endpoint becomes an agent tool without writing any code.

## Development

```bash
npm install          # install dependencies
npm run dev          # development build + file watcher
npm run lint         # ESLint (src/ + main.ts)
npm run type-check   # TypeScript type check (no emit)
npm run test         # Jest test suite
npm run build        # production bundle
```

Additional scripts: `npm run dev:hot`, `npm run build:analyze`, `npm run deploy:local`.

### Post-task rule

After every change, run `npm run lint && npm run build`. Both must succeed before the work is considered done.

## Documentation

| Document | Description |
|---|---|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/architecture/overview-en.md](docs/architecture/overview-en.md) | Architecture overview (English) |
| [docs/architecture/overview-zh.md](docs/architecture/overview-zh.md) | 架构总览（中文） |
| [docs/reference/project-structure.md](docs/reference/project-structure.md) | Full source tree reference |

Contributions, issues, and feature requests are welcome — open a PR or discussion.
