# Intelligence Assistant for Obsidian

Transform your vault into an AI-native workspace. Intelligence Assistant brings a fast chat interface, configurable agents, MCP tool integrations, RAG over your notes, web search, CLI tools, and HTTP/OpenAPI tools — all without leaving Obsidian.

> Desktop only. Requires Obsidian v1.7.2+.

## ✨ Feature Highlights

- **Modern Chat View** — Streaming chat with provider/model badges, token usage display, tool-call visualization, and an Agent mode that runs multi-step agentic loops with native function calling.
- **Multiple LLM Providers** — OpenAI, Anthropic, Google Gemini, DeepSeek, Ollama (local), OpenRouter, and SAP AI Core. Add your own credentials per provider.
- **Configurable Agents** — Define reusable agents with custom prompts, tool permissions, model strategy (default/chat-view/fixed), RAG/Web/ReAct toggles, and MCP server access.
- **MCP Integration** — Connect any Model Context Protocol server. Tool catalogs are cached for instant reuse. Includes a built-in MCP inspector for live testing.
- **RAG** — Index your vault with a local vector store and inject relevant notes as context on every query. Uses real embedding APIs (OpenAI, Google, Ollama, DeepSeek, OpenRouter).
- **Web Search** — Google CSE, Bing, Brave, SerpAPI, Tavily, SearXNG, Qwant, and Mojeek. Configurable locale, freshness, and domain filters.
- **HTTP / OpenAPI Tools** — Point the plugin at any OpenAPI spec (local or remote); every path/verb pair becomes an agent tool automatically.
- **CLI Tools** — Define custom shell commands as agent-callable tools with parameter templates, env vars, and platform presets.
- **Quick Actions** — Pre-configured editor context menu actions (summarize, explain, fix grammar, improve writing, expand text).
- **Context Attachments** — Attach files, images, or vault references to any message.

## 🚀 Quick Start

### 📦 Community Plugin (recommended)

1. Open **Settings → Community plugins** in Obsidian.
2. Browse for **"Intelligence Assistant"** and install.
3. Enable the plugin, then open **Settings → Intelligence Assistant** to configure providers.

### 🔧 Manual Install

1. Download the latest release.
2. Extract into `<vault>/.obsidian/plugins/intelligence-assistant/`.
3. Reload Obsidian and enable the plugin.

### 📋 Requirements

| Requirement | Details |
|---|---|
| Obsidian | v1.7.2 or later (desktop only) |
| Node.js | 18+ with npm (for building from source) |
| LLM API key | Per provider (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, etc.) |

## 💬 Chat Experience

1. Open the chat via the ribbon icon or **Command Palette → Open AI chat in sidebar**.
2. Choose **Chat** or **Agent** mode in the toolbar. Agent mode runs the model in a ReAct loop with tool calls.
3. Pick a provider, model, temperature, and token cap from the header controls.
4. Toggle **RAG** (vault context) or **Web search** in the input bar.
5. Attach files or vault references with `@filename`.
6. Every response shows the provider, model, and token usage. Use **Insert to Notes** to drop a reply into the active file.

## 🤖 Agents

Defined under **Settings → Agents**. Each agent has:

- System prompt, tool permissions, MCP server access
- Model strategy: `default` (use settings default), `chat-view` (follow chat selector), or `fixed` (specific model)
- Capabilities: RAG, Web Search, ReAct mode with configurable max steps
- Custom icon and display name

Agent mode uses **native function calling** (OpenAI) with automatic fallback to text-based tool parsing for other providers.

## 🔌 MCP Tools

Connect MCP servers under **Settings → MCP**. The plugin:
- Connects at startup and caches the tool manifest
- Injects MCP tools into agent loops automatically
- Provides a live **MCP Inspector** for testing tools interactively
- Supports stdio transport

## 🌐 Web Search

Configure under **Settings → Web Search**. Pick one of 8 supported providers (Google, Bing, Brave, SerpAPI, Tavily, SearXNG, Qwant, Mojeek) and set locale, result freshness, and domain filters. Credentials are stored per vault.

## 📡 HTTP / OpenAPI Tools

Add OpenAPI specs under **Settings → Tools → HTTP / OpenAPI**. For each source:
- Point at a local `.json` file or a remote URL (cached locally)
- Override the base server URL and inject auth headers or query params
- Enable/disable the source; reload tool definitions on demand

## ⌨️ CLI Tools

Define custom shell commands under **Settings → Tools → CLI Tools**. Each tool supports parameter templates (`{{param}}`), argument/env insertion modes, working directory, timeout, and platform-specific presets (25+ built-in presets for file, search, network, code, data, and system operations).

## 🛠️ Development

```bash
npm install          # install dependencies
npm run dev          # development build + file watcher
npm run lint         # ESLint (src/ + main.ts)
npm run type-check   # TypeScript type check (no emit)
npm run test         # Jest test suite
npm run build        # production bundle
```

Additional scripts: `npm run dev:deploy` (build + deploy to local vault), `npm run deploy:local`.

### ✅ Post-task rule

After every change, run `npm run lint && npm run build`. Both must succeed before the work is considered done.

## 📖 Documentation

| Document | Description |
|---|---|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/architecture/overview-en.md](docs/architecture/overview-en.md) | Architecture overview (English) |
| [docs/architecture/overview-zh.md](docs/architecture/overview-zh.md) | Architecture overview (Chinese) |
| [docs/project/project-guide-en.md](docs/project/project-guide-en.md) | Developer-oriented project guide (English) |
| [docs/project/project-guide-zh.md](docs/project/project-guide-zh.md) | Developer-oriented project guide (Chinese) |
| [docs/reference/project-structure.md](docs/reference/project-structure.md) | Full source tree reference |

Contributions, issues, and feature requests are welcome — open a PR or discussion.
